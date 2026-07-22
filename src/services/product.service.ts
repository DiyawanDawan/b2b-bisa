import {
  applyKnownFieldsFromSpecs,
  buildSpecsCreateInput,
  parseSpecsInput,
  productSpecsSelect,
  type ProductSpecInput,
} from '#utils/productSpec.util';
import prisma from '#config/prisma';
import { expireStalePromotions } from '#services/product-promotion.service';
import { scheduleSupplyDemandRefresh } from '#services/marketSupplyDemand.service';
import AppError from '#utils/appError';
import * as storageService from '#services/storage.service';
import {
  Prisma,
  BiomassaType,
  BiocharGrade,
  ProductStatus,
  ProductMode,
  OrderStatus,
  DeviceStatus,
} from '#prisma';

const enrichProductsWithActiveIot = async <T extends { userId: string; isIotMonitored: boolean }>(
  products: T[],
): Promise<(T & { hasActiveIot: boolean })[]> => {
  if (products.length === 0) return [];
  const supplierIds = [...new Set(products.map((p) => p.userId))];
  const withIot = await prisma.iotDevice.findMany({
    where: { userId: { in: supplierIds }, status: DeviceStatus.ACTIVE },
    select: { userId: true },
    distinct: ['userId'],
  });
  const iotSet = new Set(withIot.map((d) => d.userId));
  return products.map((p) => {
    const active = p.isIotMonitored || iotSet.has(p.userId);
    return { ...p, isIotMonitored: active, hasActiveIot: active };
  });
};

const enrichSingleProductIot = async <T extends { userId: string; isIotMonitored: boolean }>(
  product: T,
): Promise<T & { hasActiveIot: boolean }> => {
  const [enriched] = await enrichProductsWithActiveIot([product]);
  return enriched!;
};

const resolveAiPredictionForProduct = async (
  userId: string,
  aiPredictionId: string | undefined,
  data: {
    grade?: BiocharGrade;
    biomassaType?: BiomassaType;
    carbonPurity?: number;
  },
) => {
  if (!aiPredictionId) {
    return { isIotMonitored: false as boolean, carbonPurity: data.carbonPurity };
  }

  const prediction = await prisma.aIPrediction.findFirst({
    where: { id: aiPredictionId, userId },
  });
  if (!prediction) {
    throw new AppError('Prediksi IoT/ML tidak ditemukan atau bukan milik Anda.', 404);
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(prediction.rawOutput ?? '{}') as Record<string, unknown>;
  } catch {
    meta = {};
  }

  return {
    isIotMonitored: true,
    grade: data.grade ?? prediction.predictedGrade ?? undefined,
    biomassaType: data.biomassaType,
    carbonPurity:
      data.carbonPurity ?? (prediction.cOrganik != null ? Number(prediction.cOrganik) : undefined),
    predictionMeta: meta,
    prediction,
  };
};
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';
import { assertSupplierStoreReady } from '#utils/readiness.util';

/** Hapus file R2 produk yang tidak lagi dipakai setelah update/hapus. */
const deleteOrphanProductMedia = async (
  oldUrls: (string | null | undefined)[],
  keepUrls: string[],
) => {
  const keep = new Set(
    keepUrls
      .map((url) => storageService.normalizeStorageKey(url) ?? url)
      .filter((key): key is string => Boolean(key)),
  );

  for (const url of oldUrls) {
    const key = storageService.normalizeStorageKey(url ?? null);
    if (!key || storageService.isExternalMediaUrl(key)) continue;
    if (!keep.has(key)) {
      await storageService.deleteFile(key);
    }
  }
};

const productImagesSelect = {
  select: {
    id: true,
    url: true,
    isPrimary: true,
    order: true,
  },
  orderBy: { order: 'asc' as const },
};

const productVideoSelect = {
  select: {
    id: true,
    url: true,
    thumbnailUrl: true,
    title: true,
    durationSec: true,
  },
};

const resolveProductLocation = async (
  userId: string,
  province?: string | null,
  regency?: string | null,
) => {
  if (province?.trim()) {
    return {
      province: province.trim(),
      regency: regency?.trim() || null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { province: true, regency: true },
  });

  return {
    province: user?.province?.trim() || null,
    regency: regency?.trim() || user?.regency?.trim() || null,
  };
};

const copyProductMediaKey = async (
  sourceUrl: string | null | undefined,
  userId: string,
  label: string,
): Promise<string | null> => {
  const key = storageService.normalizeStorageKey(sourceUrl ?? null);
  if (!key || storageService.isExternalMediaUrl(key)) {
    return sourceUrl ?? null;
  }

  const ext = key.split('.').pop() || 'jpg';
  const dest = `products/${userId}/${Date.now()}_${label}.${ext}`;
  return storageService.copyFile(key, dest);
};

const publicProductUserSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  province: true,
  regency: true,
  profile: {
    select: {
      companyName: true,
      businessType: true,
      rajaongkirOriginId: true,
      rajaongkirOriginLabel: true,
    },
  },
  verification: {
    select: {
      isVerified: true,
      verificationStatus: true,
      reviewedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

type CreateProductInput = {
  name: string;
  biomassaType: BiomassaType;
  grade?: BiocharGrade;
  description?: string;
  pricePerUnit: number;
  originalPrice?: number;
  stock: number;
  minOrder?: number;
  unit: 'KG' | 'TON';
  status?: ProductStatus;
  categoryId?: string;
  province?: string;
  regency?: string;
  // Organic Produce Mode
  productMode?: ProductMode;
  fertilizerType?: string;
  isChemicalFree?: boolean;
  cropType?: string;
  availabilityType?: string;
  nextHarvestDate?: Date | string;
  nextHarvestQtyTon?: number;
  shelfLifeDays?: number;
  landAreaHa?: number;
  specs?: ProductSpecInput[];
  // Tech Specs
  moistureContent?: number;
  carbonPurity?: number;
  productionCapacity?: number;
  surfaceArea?: number;
  phLevel?: number;
  density?: string;
  carbonOffsetPerTon?: number;
  grossWeightPerSak?: number;
  netWeightPerSak?: number;
  bagDimension?: string;
};

export const createProduct = async (
  userId: string,
  data: CreateProductInput,
  imageUrls: string[] = [],
) => {
  const {
    moistureContent,
    carbonPurity,
    productionCapacity,
    surfaceArea,
    phLevel,
    density,
    carbonOffsetPerTon,
    grossWeightPerSak,
    netWeightPerSak,
    bagDimension,
    pricePerUnit,
    originalPrice,
    stock,
    minOrder,
    isChemicalFree,
    specs: specsInput,
    imageOrder: _imageOrder,
    syncImages: _syncImages,
    aiPredictionId,
    ...productData
  } = data as CreateProductInput & {
    imageOrder?: string;
    syncImages?: boolean;
    aiPredictionId?: string;
  };

  const predictionContext = await resolveAiPredictionForProduct(userId, aiPredictionId, {
    grade: productData.grade,
    biomassaType: productData.biomassaType,
    carbonPurity,
  });

  const effectiveGrade = predictionContext.grade ?? productData.grade;
  if (productData.biomassaType === BiomassaType.BIOCHAR && !effectiveGrade) {
    throw new AppError('Grade wajib diisi untuk produk Biochar (A, B, atau C).', 400);
  }

  const status = productData.status ?? ProductStatus.ACTIVE;
  if (status === ProductStatus.ACTIVE) {
    await assertSupplierStoreReady(userId);
  }
  if (status === ProductStatus.ACTIVE && imageUrls.length === 0) {
    throw new AppError('Produk ACTIVE wajib memiliki minimal satu foto.', 400);
  }

  const location = await resolveProductLocation(userId, productData.province, productData.regency);

  const parsedSpecs = parseSpecsInput(specsInput);
  const mappedFromSpecs = applyKnownFieldsFromSpecs(
    productData.productMode,
    parsedSpecs,
  ) as Partial<CreateProductInput>;

  const merged = {
    ...productData,
    grade: effectiveGrade,
    ...mappedFromSpecs,
    moistureContent: mappedFromSpecs.moistureContent ?? moistureContent,
    carbonPurity: mappedFromSpecs.carbonPurity ?? predictionContext.carbonPurity ?? carbonPurity,
    productionCapacity: mappedFromSpecs.productionCapacity ?? productionCapacity,
    surfaceArea: mappedFromSpecs.surfaceArea ?? surfaceArea,
    phLevel: mappedFromSpecs.phLevel ?? phLevel,
    density: mappedFromSpecs.density ?? density,
    carbonOffsetPerTon: mappedFromSpecs.carbonOffsetPerTon ?? carbonOffsetPerTon,
    grossWeightPerSak: mappedFromSpecs.grossWeightPerSak ?? grossWeightPerSak,
    netWeightPerSak: mappedFromSpecs.netWeightPerSak ?? netWeightPerSak,
    bagDimension: mappedFromSpecs.bagDimension ?? bagDimension,
    cropType: mappedFromSpecs.cropType ?? productData.cropType,
    fertilizerType: mappedFromSpecs.fertilizerType ?? productData.fertilizerType,
    shelfLifeDays: mappedFromSpecs.shelfLifeDays ?? productData.shelfLifeDays,
    landAreaHa: mappedFromSpecs.landAreaHa ?? productData.landAreaHa,
    isChemicalFree:
      mappedFromSpecs.isChemicalFree !== undefined
        ? mappedFromSpecs.isChemicalFree
        : isChemicalFree,
  };

  const isChemicalFreeVal =
    merged.isChemicalFree === true || (merged.isChemicalFree as any) === 'true';

  const thumbnailUrl = imageUrls.length > 0 ? imageUrls[0] : null;

  const product = await prisma.product.create({
    data: {
      ...productData,
      grade: effectiveGrade,
      isIotMonitored: predictionContext.isIotMonitored,
      cropType: merged.cropType as string | undefined,
      fertilizerType: merged.fertilizerType as string | undefined,
      isChemicalFree: isChemicalFreeVal,
      ...(merged.shelfLifeDays != null && {
        shelfLifeDays: Number(merged.shelfLifeDays),
      }),
      ...(merged.landAreaHa != null && {
        landAreaHa: new Prisma.Decimal(merged.landAreaHa as number),
      }),
      ...(productData.availabilityType && {
        availabilityType: productData.availabilityType as never,
      }),
      ...(productData.nextHarvestDate && {
        nextHarvestDate: new Date(productData.nextHarvestDate),
      }),
      ...(productData.nextHarvestQtyTon != null && {
        nextHarvestQtyTon: new Prisma.Decimal(productData.nextHarvestQtyTon),
      }),
      pricePerUnit: new Prisma.Decimal(pricePerUnit),
      ...(originalPrice !== undefined && { originalPrice: new Prisma.Decimal(originalPrice) }),
      stock: new Prisma.Decimal(stock),
      minOrder: minOrder ? new Prisma.Decimal(minOrder) : new Prisma.Decimal(100),
      thumbnailUrl,
      userId,
      province: location.province,
      regency: location.regency,
      technicalSpec: {
        create: {
          moistureContent: merged.moistureContent
            ? new Prisma.Decimal(merged.moistureContent as number)
            : null,
          carbonPurity: merged.carbonPurity
            ? new Prisma.Decimal(merged.carbonPurity as number)
            : null,
          productionCapacity: merged.productionCapacity
            ? new Prisma.Decimal(merged.productionCapacity as number)
            : null,
          surfaceArea: merged.surfaceArea ? new Prisma.Decimal(merged.surfaceArea as number) : null,
          phLevel: merged.phLevel ? new Prisma.Decimal(merged.phLevel as number) : null,
          density: merged.density as string | undefined,
          carbonOffsetPerTon: merged.carbonOffsetPerTon
            ? new Prisma.Decimal(merged.carbonOffsetPerTon as number)
            : null,
          grossWeightPerSak: merged.grossWeightPerSak
            ? new Prisma.Decimal(merged.grossWeightPerSak as number)
            : null,
          netWeightPerSak: merged.netWeightPerSak
            ? new Prisma.Decimal(merged.netWeightPerSak as number)
            : null,
          bagDimension: merged.bagDimension as string | undefined,
        },
      },
      ...(parsedSpecs.length > 0 && {
        specs: { create: buildSpecsCreateInput(parsedSpecs) },
      }),
      images: {
        create: imageUrls.map((url, index) => ({
          url,
          isPrimary: index === 0,
          order: index,
        })),
      },
    },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      name: true,
      biomassaType: true,
      grade: true,
      description: true,
      pricePerUnit: true,
      originalPrice: true,
      stock: true,
      reservedStock: true,
      minOrder: true,
      unit: true,
      status: true,
      productMode: true,
      fertilizerType: true,
      isChemicalFree: true,
      cropType: true,
      availabilityType: true,
      nextHarvestDate: true,
      nextHarvestQtyTon: true,
      shelfLifeDays: true,
      landAreaHa: true,
      specs: productSpecsSelect,
      harvestLots: {
        orderBy: { expectedHarvestDate: 'asc' },
        select: {
          id: true,
          seasonLabel: true,
          expectedHarvestDate: true,
          expectedQuantityTon: true,
          actualHarvestDate: true,
          actualQuantityTon: true,
          status: true,
          notes: true,
          stockedAt: true,
        },
      },
      thumbnailUrl: true,
      averageRating: true,
      totalReviews: true,
      province: true,
      regency: true,
      createdAt: true,
      updatedAt: true,
      category: {
        select: {
          id: true,
          name: true,
          categoryType: true,
        },
      },
      technicalSpec: {
        select: {
          moistureContent: true,
          carbonPurity: true,
          productionCapacity: true,
          surfaceArea: true,
          phLevel: true,
          density: true,
          carbonOffsetPerTon: true,
          grossWeightPerSak: true,
          netWeightPerSak: true,
          bagDimension: true,
        },
      },
      images: productImagesSelect,
      video: productVideoSelect,
      user: { select: publicProductUserSelect },
    },
  });

  scheduleSupplyDemandRefresh();
  return product;
};

export const listProducts = async (filters: {
  search?: string;
  status?: ProductStatus;
  userId?: string;
  biomassaType?: BiomassaType;
  grade?: BiocharGrade;
  province?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  minStock?: number;
  minRating?: number;
  minCarbonPurity?: number;
  maxMoistureContent?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  productMode?: ProductMode;
  cropType?: string;
  availabilityType?: string;
  harvestAfter?: Date;
  harvestBefore?: Date;
  isChemicalFree?: boolean;
  canBook?: boolean;
  availableNow?: boolean;
  preHarvestBookable?: boolean;
}) => {
  const {
    search,
    status,
    userId,
    biomassaType,
    grade,
    province,
    categoryId,
    minPrice,
    maxPrice,
    minStock,
    minRating,
    minCarbonPurity,
    maxMoistureContent,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10,
    productMode,
    cropType,
    availabilityType,
    harvestAfter,
    harvestBefore,
    isChemicalFree,
    canBook,
    availableNow,
    preHarvestBookable,
  } = filters;

  const where: any = {
    ...(userId && { userId }),
    ...(categoryId && { categoryId }),
    status: status || (userId ? { not: ProductStatus.DELETED } : ProductStatus.ACTIVE),
    ...(search && {
      OR: [{ name: { contains: search } }, { description: { contains: search } }],
    }),
    ...(biomassaType && { biomassaType }),
    ...(grade && { grade }),
    ...(province && { province: { startsWith: province } }),
    ...(minStock !== undefined && { stock: { gte: minStock } }),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? {
          pricePerUnit: {
            gte: minPrice ? new Prisma.Decimal(minPrice) : undefined,
            lte: maxPrice ? new Prisma.Decimal(maxPrice) : undefined,
          },
        }
      : {}),
    ...(minRating !== undefined && { averageRating: { gte: minRating } }),
    // Organic Produce Mode filters
    ...(productMode && { productMode }),
    ...(cropType && { cropType }),
    ...(availabilityType && { availabilityType }),
    ...(harvestAfter || harvestBefore
      ? {
          nextHarvestDate: {
            ...(harvestAfter ? { gte: harvestAfter } : {}),
            ...(harvestBefore ? { lte: harvestBefore } : {}),
          },
        }
      : {}),
    ...(isChemicalFree !== undefined && { isChemicalFree }),
    // Advanced Technical Filters
    ...(minCarbonPurity !== undefined || maxMoistureContent !== undefined
      ? {
          technicalSpec: {
            ...(minCarbonPurity !== undefined && { carbonPurity: { gte: minCarbonPurity } }),
            ...(maxMoistureContent !== undefined && {
              moistureContent: { lte: maxMoistureContent },
            }),
          },
        }
      : {}),
  };

  const bookingAndFilters: any[] = [];
  if (availableNow) {
    bookingAndFilters.push({
      OR: [{ availabilityType: 'READY' }, { availabilityType: 'MIXED' }],
    });
  }
  if (preHarvestBookable) {
    bookingAndFilters.push({
      OR: [{ availabilityType: 'PRE_HARVEST' }, { availabilityType: 'MIXED' }],
    });
  }
  if (canBook) {
    bookingAndFilters.push({
      OR: [
        { stock: { gt: new Prisma.Decimal(0) } },
        { availabilityType: 'PRE_HARVEST' },
        { availabilityType: 'MIXED' },
      ],
    });
  }
  if (bookingAndFilters.length > 0) {
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [...existingAnd, ...bookingAndFilters];
  }

  await expireStalePromotions();

  const isPublicCatalog = !userId;
  const orderBy = isPublicCatalog
    ? [{ isPromoted: 'desc' as const }, { [sortBy]: sortOrder }]
    : { [sortBy]: sortOrder };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      select: {
        id: true,
        userId: true,
        categoryId: true,
        name: true,
        biomassaType: true,
        grade: true,
        description: true,
        pricePerUnit: true,
        originalPrice: true,
        stock: true,
        reservedStock: true,
        minOrder: true,
        unit: true,
        status: true,
        productMode: true,
        fertilizerType: true,
        isChemicalFree: true,
        cropType: true,
        availabilityType: true,
        nextHarvestDate: true,
        nextHarvestQtyTon: true,
        specs: productSpecsSelect,
        isCertified: true,
        isIotMonitored: true,
        isEscrowProtected: true,
        thumbnailUrl: true,
        averageRating: true,
        totalReviews: true,
        province: true,
        regency: true,
        createdAt: true,
        updatedAt: true,
        isPromoted: true,
        promotedUntil: true,
        video: productVideoSelect,
        category: {
          select: {
            id: true,
            name: true,
            categoryType: true,
          },
        },
        // Hanya ambil 2 "signal spec" untuk ditampilkan di ProductCard grid.
        // Field lengkap (10+) hanya diambil di getProductById untuk halaman detail.
        // Ini mengurangi JOIN overhead secara signifikan saat list 20+ produk sekaligus.
        technicalSpec: {
          select: {
            carbonPurity: true, // Ditampilkan di kartu sebagai badge "C: XX%"
            moistureContent: true, // Ditampilkan di kartu sebagai badge "Moisture: XX%"
            netWeightPerSak: true,
            density: true,
          },
        },
        images: productImagesSelect,
        user: {
          select: publicProductUserSelect,
        },
      },
    }),
  ]);
  // averageRating & totalReviews are kept in-sync by the review service cache writer.
  // No need to re-compute from a join — just map the user verification flags.
  const mappedProducts = products.map((p) => {
    const stock = Number(p.stock);
    const reserved = Number((p as { reservedStock?: Prisma.Decimal }).reservedStock ?? 0);
    return {
      ...p,
      reservedStock: reserved,
      availableStock: Math.max(0, stock - reserved),
      canBook:
        p.status === ProductStatus.ACTIVE &&
        (stock - reserved > 0 ||
          p.availabilityType === 'PRE_HARVEST' ||
          p.availabilityType === 'MIXED'),
      user: {
        ...p.user,
        isVerified: p.user?.verification?.isVerified || false,
        verificationStatus: p.user?.verification?.verificationStatus || 'PENDING',
      },
    };
  });

  const enriched = await enrichProductsWithActiveIot(mappedProducts);
  return { total, page, limit, products: enriched };
};

export const getProductById = async (id: string, requestUserId?: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      name: true,
      biomassaType: true,
      grade: true,
      description: true,
      pricePerUnit: true,
      originalPrice: true,
      stock: true,
      reservedStock: true,
      minOrder: true,
      unit: true,
      status: true,
      productMode: true,
      fertilizerType: true,
      isChemicalFree: true,
      cropType: true,
      availabilityType: true,
      nextHarvestDate: true,
      nextHarvestQtyTon: true,
      shelfLifeDays: true,
      landAreaHa: true,
      specs: productSpecsSelect,
      isCertified: true,
      isIotMonitored: true,
      isEscrowProtected: true,
      thumbnailUrl: true,
      averageRating: true,
      totalReviews: true,
      totalSold: true,
      viewCount: true,
      province: true,
      regency: true,
      createdAt: true,
      updatedAt: true,
      isPromoted: true,
      promotedUntil: true,
      promoImpressions: true,
      promoClicks: true,
      video: productVideoSelect,
      category: {
        select: {
          id: true,
          name: true,
          categoryType: true,
        },
      },
      technicalSpec: {
        select: {
          moistureContent: true,
          carbonPurity: true,
          productionCapacity: true,
          surfaceArea: true,
          phLevel: true,
          density: true,
          carbonOffsetPerTon: true,
          grossWeightPerSak: true,
          netWeightPerSak: true,
          bagDimension: true,
          heavyMetals: true,
        },
      },
      images: productImagesSelect,
      certificates: {
        where: {
          status: 'APPROVED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          id: true,
          productId: true,
          title: true,
          certificateType: true,
          issuerName: true,
          certificateNumber: true,
          issuedAt: true,
          expiresAt: true,
          mimeType: true,
          fileName: true,
          reviewedAt: true,
        },
        orderBy: { reviewedAt: 'desc' },
      },
      user: {
        select: publicProductUserSelect,
      },
    },
  });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);

  const isOwner = !!requestUserId && product.userId === requestUserId;
  if (product.status !== ProductStatus.ACTIVE && !isOwner) {
    throw new AppError('Produk tidak ditemukan.', 404);
  }

  if (!isOwner && product.status === ProductStatus.ACTIVE) {
    await prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    product.viewCount += 1;
  }

  // averageRating & totalReviews are kept in-sync by the review service cache writer.
  const stock = Number(product.stock);
  const reserved = Number((product as { reservedStock?: Prisma.Decimal }).reservedStock ?? 0);
  const base = {
    ...product,
    isCertified: product.certificates.length > 0,
    reservedStock: reserved,
    availableStock: Math.max(0, stock - reserved),
    canBook: product.status === ProductStatus.ACTIVE && stock - reserved > 0,
    user: {
      ...product.user,
      isVerified: product.user?.verification?.isVerified || false,
      verificationStatus: product.user?.verification?.verificationStatus || 'PENDING',
    },
  };
  return enrichSingleProductIot(base);
};

export const getProductStats = async (id: string, userId: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      userId: true,
      viewCount: true,
      totalSold: true,
      totalReviews: true,
      averageRating: true,
    },
  });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId !== userId)
    throw new AppError('Anda tidak memiliki akses ke statistik produk ini.', 403);

  const activeNegotiations = await prisma.negotiation.count({
    where: { productId: id, status: 'OPEN_NEGOTIATION' },
  });

  const engagement = await prisma.product.findUnique({
    where: { id },
    select: {
      _count: { select: { productLikes: true, cartItems: true } },
    },
  });

  return {
    viewCount: product.viewCount,
    totalSold: product.totalSold,
    activeNegotiations,
    totalReviews: product.totalReviews,
    averageRating: Number(product.averageRating),
    likeCount: engagement?._count.productLikes ?? 0,
    cartCount: engagement?._count.cartItems ?? 0,
  };
};

export const duplicateProduct = async (id: string, userId: string) => {
  const source = await prisma.product.findUnique({
    where: { id },
    include: {
      technicalSpec: true,
      images: { orderBy: { order: 'asc' } },
      video: true,
      specs: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!source) throw new AppError('Produk tidak ditemukan.', 404);
  if (source.userId !== userId)
    throw new AppError('Anda tidak memiliki akses untuk menduplikasi produk ini.', 403);

  const { technicalSpec, images, specs, video, ...base } = source;

  const copiedImages = await Promise.all(
    images.map(async (img, index) => {
      const copiedUrl = await copyProductMediaKey(img.url, userId, `dup_${index}`);
      return {
        url: copiedUrl ?? img.url,
        isPrimary: img.isPrimary,
        order: img.order,
      };
    }),
  );

  const copiedThumbnail = base.thumbnailUrl
    ? await copyProductMediaKey(base.thumbnailUrl, userId, 'dup_thumb')
    : (copiedImages.find((img) => img.isPrimary)?.url ?? copiedImages[0]?.url ?? null);

  const copiedVideoUrl = video?.url
    ? await copyProductMediaKey(video.url, userId, 'dup_video')
    : null;
  const copiedVideoThumbnail = video?.thumbnailUrl
    ? await copyProductMediaKey(video.thumbnailUrl, userId, 'dup_video_thumb')
    : null;

  const created = await prisma.product.create({
    data: {
      userId,
      categoryId: base.categoryId,
      name: `${base.name} (Copy)`,
      biomassaType: base.biomassaType,
      grade: base.grade,
      description: base.description,
      pricePerUnit: base.pricePerUnit,
      originalPrice: base.originalPrice,
      stock: base.stock,
      minOrder: base.minOrder,
      unit: base.unit,
      status: ProductStatus.DRAFT,
      productMode: base.productMode,
      fertilizerType: base.fertilizerType,
      isChemicalFree: base.isChemicalFree,
      cropType: base.cropType,
      province: base.province,
      regency: base.regency,
      thumbnailUrl: copiedThumbnail,
      isCertified: false,
      isIotMonitored: base.isIotMonitored,
      isEscrowProtected: base.isEscrowProtected,
      averageRating: 0,
      totalReviews: 0,
      totalSold: 0,
      viewCount: 0,
      technicalSpec: technicalSpec
        ? {
            create: {
              moistureContent: technicalSpec.moistureContent,
              carbonPurity: technicalSpec.carbonPurity,
              productionCapacity: technicalSpec.productionCapacity,
              surfaceArea: technicalSpec.surfaceArea,
              phLevel: technicalSpec.phLevel,
              density: technicalSpec.density,
              carbonOffsetPerTon: technicalSpec.carbonOffsetPerTon,
              grossWeightPerSak: technicalSpec.grossWeightPerSak,
              netWeightPerSak: technicalSpec.netWeightPerSak,
              bagDimension: technicalSpec.bagDimension,
              heavyMetals: technicalSpec.heavyMetals ?? undefined,
            },
          }
        : undefined,
      ...(specs.length > 0 && {
        specs: {
          create: specs.map(({ label, value, sortOrder }) => ({
            label,
            value,
            sortOrder,
          })),
        },
      }),
      images: {
        create: copiedImages.map((img) => ({
          url: img.url,
          isPrimary: img.isPrimary,
          order: img.order,
        })),
      },
      ...(copiedVideoUrl && {
        video: {
          create: {
            url: copiedVideoUrl,
            ...(copiedVideoThumbnail && { thumbnailUrl: copiedVideoThumbnail }),
            ...(video?.title && { title: video.title }),
            ...(video?.durationSec != null && { durationSec: video.durationSec }),
          },
        },
      }),
    },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      name: true,
      biomassaType: true,
      grade: true,
      description: true,
      pricePerUnit: true,
      originalPrice: true,
      stock: true,
      minOrder: true,
      unit: true,
      status: true,
      productMode: true,
      fertilizerType: true,
      isChemicalFree: true,
      cropType: true,
      availabilityType: true,
      nextHarvestDate: true,
      nextHarvestQtyTon: true,
      shelfLifeDays: true,
      landAreaHa: true,
      specs: productSpecsSelect,
      isCertified: true,
      isIotMonitored: true,
      isEscrowProtected: true,
      thumbnailUrl: true,
      averageRating: true,
      totalReviews: true,
      totalSold: true,
      viewCount: true,
      province: true,
      regency: true,
      createdAt: true,
      updatedAt: true,
      video: productVideoSelect,
      category: {
        select: { id: true, name: true, categoryType: true },
      },
      technicalSpec: {
        select: {
          moistureContent: true,
          carbonPurity: true,
          productionCapacity: true,
          surfaceArea: true,
          phLevel: true,
          density: true,
          carbonOffsetPerTon: true,
          grossWeightPerSak: true,
          netWeightPerSak: true,
          bagDimension: true,
          heavyMetals: true,
        },
      },
      images: productImagesSelect,
      user: { select: publicProductUserSelect },
    },
  });

  return {
    ...created,
    user: {
      ...created.user,
      isVerified: created.user?.verification?.isVerified || false,
      verificationStatus: created.user?.verification?.verificationStatus || 'PENDING',
    },
  };
};

export const updateProduct = async (
  id: string,
  userId: string,
  data: Partial<CreateProductInput>,
  imageUrls: string[] = [],
  syncImages = false,
) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId !== userId)
    throw new AppError('Anda tidak memiliki akses untuk mengubah produk ini.', 403);

  const nextBiomassaType = (data.biomassaType ?? product.biomassaType) as BiomassaType;
  const nextGrade = data.grade ?? product.grade;
  if (nextBiomassaType === BiomassaType.BIOCHAR && !nextGrade) {
    throw new AppError('Grade wajib diisi untuk produk Biochar (A, B, atau C).', 400);
  }

  if (syncImages && imageUrls.length === 0) {
    throw new AppError('Sinkronisasi foto gagal: daftar foto kosong.', 400);
  }

  const nextStatus = (data.status ?? product.status) as ProductStatus;
  if (nextStatus === ProductStatus.ACTIVE && product.status !== ProductStatus.ACTIVE) {
    await assertSupplierStoreReady(userId);
  }

  const {
    moistureContent,
    carbonPurity,
    productionCapacity,
    surfaceArea,
    phLevel,
    density,
    carbonOffsetPerTon,
    grossWeightPerSak,
    netWeightPerSak,
    bagDimension,
    pricePerUnit,
    stock,
    minOrder,
    originalPrice,
    isChemicalFree,
    specs: specsInput,
    syncImages: _syncImages,
    imageOrder: _imageOrder,
    ...productUpdateData
  } = data as Partial<CreateProductInput> & {
    syncImages?: boolean;
    imageOrder?: string;
  };

  const parsedSpecs = parseSpecsInput(specsInput);
  const hasSpecsPayload = specsInput !== undefined;
  const mappedFromSpecs = hasSpecsPayload
    ? (applyKnownFieldsFromSpecs(product.productMode, parsedSpecs) as Partial<CreateProductInput>)
    : {};

  const resolvedMoisture = mappedFromSpecs.moistureContent ?? moistureContent;
  const resolvedCarbon = mappedFromSpecs.carbonPurity ?? carbonPurity;
  const resolvedCapacity = mappedFromSpecs.productionCapacity ?? productionCapacity;
  const resolvedSurface = mappedFromSpecs.surfaceArea ?? surfaceArea;
  const resolvedPh = mappedFromSpecs.phLevel ?? phLevel;
  const resolvedDensity = mappedFromSpecs.density ?? density;
  const resolvedOffset = mappedFromSpecs.carbonOffsetPerTon ?? carbonOffsetPerTon;
  const resolvedGross = mappedFromSpecs.grossWeightPerSak ?? grossWeightPerSak;
  const resolvedNet = mappedFromSpecs.netWeightPerSak ?? netWeightPerSak;
  const resolvedBag = mappedFromSpecs.bagDimension ?? bagDimension;

  const isChemicalFreeVal =
    mappedFromSpecs.isChemicalFree !== undefined
      ? mappedFromSpecs.isChemicalFree === true ||
        (mappedFromSpecs.isChemicalFree as any) === 'true'
      : isChemicalFree !== undefined
        ? isChemicalFree === true || (isChemicalFree as any) === 'true'
        : undefined;

  // Runtime: multipart form data bisa kirim originalPrice sebagai number, null,
  // string kosong, atau literal "null". TS hanya tahu signature `number?`, jadi
  // cast ke `unknown` agar perbandingan string tidak di-reject (TS2367).
  const originalPriceRaw = originalPrice as unknown;
  const originalPriceVal =
    originalPriceRaw === undefined
      ? undefined
      : originalPriceRaw === null || originalPriceRaw === '' || originalPriceRaw === 'null'
        ? null
        : new Prisma.Decimal(Number(originalPriceRaw));

  const location =
    productUpdateData.province !== undefined ||
    productUpdateData.regency !== undefined ||
    !product.province
      ? await resolveProductLocation(
          userId,
          productUpdateData.province ?? product.province,
          productUpdateData.regency ?? product.regency,
        )
      : null;

  const thumbnailUrl = syncImages
    ? imageUrls.length > 0
      ? imageUrls[0]
      : null
    : imageUrls.length > 0
      ? imageUrls[0]
      : undefined;

  const willReplaceImages = syncImages || imageUrls.length > 0;
  const existingMedia = willReplaceImages
    ? await prisma.product.findUnique({
        where: { id },
        select: {
          thumbnailUrl: true,
          images: { select: { url: true } },
        },
      })
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    if (hasSpecsPayload) {
      await tx.productSpec.deleteMany({ where: { productId: id } });
      if (parsedSpecs.length > 0) {
        await tx.productSpec.createMany({
          data: buildSpecsCreateInput(parsedSpecs).map((row) => ({
            ...row,
            productId: id,
          })),
        });
      }
    }

    return tx.product.update({
      where: { id },
      data: {
        ...productUpdateData,
        ...(location && {
          province: location.province,
          regency: location.regency,
        }),
        ...(mappedFromSpecs.cropType !== undefined && {
          cropType: mappedFromSpecs.cropType as string,
        }),
        ...(mappedFromSpecs.fertilizerType !== undefined && {
          fertilizerType: mappedFromSpecs.fertilizerType as string,
        }),
        ...(mappedFromSpecs.shelfLifeDays !== undefined && {
          shelfLifeDays: Number(mappedFromSpecs.shelfLifeDays),
        }),
        ...(mappedFromSpecs.landAreaHa !== undefined && {
          landAreaHa: new Prisma.Decimal(mappedFromSpecs.landAreaHa as number),
        }),
        ...(data.shelfLifeDays !== undefined && {
          shelfLifeDays: data.shelfLifeDays,
        }),
        ...(data.landAreaHa !== undefined && {
          landAreaHa: new Prisma.Decimal(data.landAreaHa),
        }),
        ...(data.availabilityType !== undefined && {
          availabilityType: data.availabilityType as never,
        }),
        ...(data.nextHarvestDate !== undefined && {
          nextHarvestDate: data.nextHarvestDate ? new Date(data.nextHarvestDate) : null,
        }),
        ...(data.nextHarvestQtyTon !== undefined && {
          nextHarvestQtyTon:
            data.nextHarvestQtyTon == null ? null : new Prisma.Decimal(data.nextHarvestQtyTon),
        }),
        ...(isChemicalFreeVal !== undefined && { isChemicalFree: isChemicalFreeVal }),
        ...(pricePerUnit !== undefined && { pricePerUnit: new Prisma.Decimal(pricePerUnit) }),
        ...(originalPriceVal !== undefined && { originalPrice: originalPriceVal }),
        ...(stock !== undefined && { stock: new Prisma.Decimal(stock) }),
        ...(minOrder !== undefined && { minOrder: new Prisma.Decimal(minOrder) }),
        technicalSpec: {
          upsert: {
            create: {
              moistureContent: resolvedMoisture ? new Prisma.Decimal(resolvedMoisture) : null,
              carbonPurity: resolvedCarbon ? new Prisma.Decimal(resolvedCarbon) : null,
              productionCapacity: resolvedCapacity ? new Prisma.Decimal(resolvedCapacity) : null,
              surfaceArea: resolvedSurface ? new Prisma.Decimal(resolvedSurface) : null,
              phLevel: resolvedPh ? new Prisma.Decimal(resolvedPh) : null,
              density: resolvedDensity,
              carbonOffsetPerTon: resolvedOffset ? new Prisma.Decimal(resolvedOffset) : null,
              grossWeightPerSak: resolvedGross ? new Prisma.Decimal(resolvedGross) : null,
              netWeightPerSak: resolvedNet ? new Prisma.Decimal(resolvedNet) : null,
              bagDimension: resolvedBag,
            },
            update: {
              ...(resolvedMoisture !== undefined && {
                moistureContent: new Prisma.Decimal(resolvedMoisture),
              }),
              ...(resolvedCarbon !== undefined && {
                carbonPurity: new Prisma.Decimal(resolvedCarbon),
              }),
              ...(resolvedCapacity !== undefined && {
                productionCapacity: new Prisma.Decimal(resolvedCapacity),
              }),
              ...(resolvedSurface !== undefined && {
                surfaceArea: new Prisma.Decimal(resolvedSurface),
              }),
              ...(resolvedPh !== undefined && { phLevel: new Prisma.Decimal(resolvedPh) }),
              ...(resolvedDensity !== undefined && { density: resolvedDensity }),
              ...(resolvedOffset !== undefined && {
                carbonOffsetPerTon: new Prisma.Decimal(resolvedOffset),
              }),
              ...(resolvedGross !== undefined && {
                grossWeightPerSak: new Prisma.Decimal(resolvedGross),
              }),
              ...(resolvedNet !== undefined && {
                netWeightPerSak: new Prisma.Decimal(resolvedNet),
              }),
              ...(resolvedBag !== undefined && { bagDimension: resolvedBag }),
            },
          },
        },
        ...(syncImages && {
          thumbnailUrl,
          images: {
            deleteMany: {},
            create: imageUrls.map((url, index) => ({
              url,
              isPrimary: index === 0,
              order: index,
            })),
          },
        }),
        ...(!syncImages &&
          imageUrls.length > 0 && {
            thumbnailUrl,
            images: {
              deleteMany: {},
              create: imageUrls.map((url, index) => ({
                url,
                isPrimary: index === 0,
                order: index,
              })),
            },
          }),
      },
      select: {
        id: true,
        userId: true,
        categoryId: true,
        name: true,
        biomassaType: true,
        grade: true,
        description: true,
        pricePerUnit: true,
        originalPrice: true,
        stock: true,
        reservedStock: true,
        minOrder: true,
        unit: true,
        status: true,
        productMode: true,
        fertilizerType: true,
        isChemicalFree: true,
        cropType: true,
        availabilityType: true,
        nextHarvestDate: true,
        nextHarvestQtyTon: true,
        specs: productSpecsSelect,
        thumbnailUrl: true,
        averageRating: true,
        totalReviews: true,
        province: true,
        regency: true,
        createdAt: true,
        updatedAt: true,
        technicalSpec: {
          select: {
            moistureContent: true,
            carbonPurity: true,
            productionCapacity: true,
            surfaceArea: true,
            phLevel: true,
            density: true,
            carbonOffsetPerTon: true,
            grossWeightPerSak: true,
            netWeightPerSak: true,
            bagDimension: true,
          },
        },
        images: productImagesSelect,
        video: productVideoSelect,
      },
    });
  });

  if (willReplaceImages && existingMedia) {
    await deleteOrphanProductMedia(
      [existingMedia.thumbnailUrl, ...existingMedia.images.map((img) => img.url)],
      imageUrls,
    );
  }

  scheduleSupplyDemandRefresh();
  return updated;
};

export const deleteProduct = async (id: string, userId: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      thumbnailUrl: true,
      images: { select: { url: true } },
      video: { select: { url: true } },
      _count: {
        select: { orderItems: true },
      },
    },
  });

  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId !== userId)
    throw new AppError('Anda tidak memiliki akses untuk menghapus produk ini.', 403);

  // 1. Check for ACTIVE orders (PENDING, CONFIRMED, PROCESSING, SHIPPED)
  const activeOrders = await prisma.order.findFirst({
    where: {
      items: { some: { productId: id } },
      status: {
        in: [
          OrderStatus.PENDING,
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
        ],
      },
    },
  });

  if (activeOrders) {
    throw new AppError(
      'Produk tidak dapat dihapus karena sedang dalam proses transaksi aktif.',
      400,
    );
  }

  // 2. Decision Logic: Hard Delete vs Soft Delete
  if (product._count.orderItems === 0) {
    await prisma.product.delete({ where: { id } });
    await deleteOrphanProductMedia(
      [product.thumbnailUrl, product.video?.url, ...product.images.map((img) => img.url)].filter(
        (url): url is string => Boolean(url),
      ),
      [],
    );
    scheduleSupplyDemandRefresh();
    return { message: 'Produk berhasil dihapus secara permanen.' };
  } else {
    await prisma.product.update({
      where: { id },
      data: { status: ProductStatus.DELETED },
    });
    scheduleSupplyDemandRefresh();
    return { message: 'Produk berhasil dihapus (Riwayat transaksi diarsipkan).' };
  }
};

/**
 * Get Featured Products (Certified & Active)
 */
/**
 * Rekomendasi produk: same category / productMode top sellers + co-purchase ringan.
 */
export const getProductRecommendations = async (productId: string, limit = 8) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      categoryId: true,
      productMode: true,
      biomassaType: true,
      userId: true,
    },
  });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);

  const coPurchase = await prisma.orderItem.findMany({
    where: {
      order: { status: { in: ['COMPLETED', 'SHIPPED', 'PROCESSING', 'CONFIRMED'] } },
      productId,
    },
    select: { orderId: true },
    take: 40,
    orderBy: { createdAt: 'desc' },
  });
  const orderIds = coPurchase.map((r) => r.orderId);
  let coProductIds: string[] = [];
  if (orderIds.length > 0) {
    const siblings = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        orderId: { in: orderIds },
        productId: { not: productId },
        product: { status: ProductStatus.ACTIVE },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });
    coProductIds = siblings.map((s) => s.productId);
  }

  const categoryProducts =
    coProductIds.length >= limit
      ? []
      : await prisma.product.findMany({
          where: {
            id: { not: productId },
            status: ProductStatus.ACTIVE,
            productMode: product.productMode,
            userId: { not: product.userId },
            ...(product.categoryId ? { categoryId: product.categoryId } : {}),
            ...(coProductIds.length ? { id: { notIn: coProductIds } } : {}),
          },
          orderBy: [{ totalSold: 'desc' }, { averageRating: 'desc' }],
          take: limit - coProductIds.length,
          select: {
            id: true,
            name: true,
            pricePerUnit: true,
            originalPrice: true,
            unit: true,
            thumbnailUrl: true,
            biomassaType: true,
            grade: true,
            productMode: true,
            averageRating: true,
            totalReviews: true,
            totalSold: true,
            isCertified: true,
            user: { select: { id: true, fullName: true } },
          },
        });

  const coProducts =
    coProductIds.length === 0
      ? []
      : await prisma.product.findMany({
          where: { id: { in: coProductIds }, status: ProductStatus.ACTIVE },
          select: {
            id: true,
            name: true,
            pricePerUnit: true,
            originalPrice: true,
            unit: true,
            thumbnailUrl: true,
            biomassaType: true,
            grade: true,
            productMode: true,
            averageRating: true,
            totalReviews: true,
            totalSold: true,
            isCertified: true,
            user: { select: { id: true, fullName: true } },
          },
        });

  const byId = new Map(coProducts.map((p) => [p.id, p]));
  const ordered = coProductIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null);

  const combined = [...ordered, ...categoryProducts].slice(0, limit);
  return enrichProductsWithActiveIot(combined);
};

export const getFeaturedProducts = async (limit: number = 6) => {
  return prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      isCertified: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      pricePerUnit: true,
      originalPrice: true,
      unit: true,
      thumbnailUrl: true,
      biomassaType: true,
      grade: true,
      province: true,
      regency: true,
      averageRating: true,
      totalReviews: true,
      isCertified: true,
      user: {
        select: {
          fullName: true,
        },
      },
    },
  });
};

/**
 * Get Products by Collection Slug
 */
export const getProductsByCollection = async (
  slug: string,
  page: number = 1,
  limit: number = 10,
) => {
  // Step 1: Find the collection
  const collection = await prisma.productCollection.findUnique({
    where: { slug, isActive: true },
    select: { id: true },
  });

  if (!collection) return [];

  // Step 2: Fetch paginated items with full product data
  const items = await prisma.productCollectionItem.findMany({
    where: { collectionId: collection.id },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { order: 'asc' },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          pricePerUnit: true,
          originalPrice: true,
          unit: true,
          thumbnailUrl: true,
          biomassaType: true,
          grade: true,
          province: true,
          regency: true,
          averageRating: true,
          totalReviews: true,
          isCertified: true,
          stock: true,
          minOrder: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              verification: {
                select: {
                  isVerified: true,
                },
              },
              profile: {
                select: {
                  companyName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return items.map((item) => {
    const p = item.product as any;
    if (p.user) {
      p.user.isVerified = p.user.verification?.isVerified || false;
      delete p.user.verification;
    }
    return p;
  });
};

/**
 * List all active collections
 */
export const listCollections = async () =>
  cacheAside(cacheKeys.prodCollections(), CACHE_TTL.PROD_COLLECTIONS, () =>
    prisma.productCollection.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
  );

/**
 * Supplier: like & cart engagement across all own products
 */
export const getSupplierProductEngagement = async (sellerId: string) => {
  const products = await prisma.product.findMany({
    where: {
      userId: sellerId,
      status: { not: 'DELETED' },
    },
    select: {
      id: true,
      name: true,
      thumbnailUrl: true,
      pricePerUnit: true,
      unit: true,
      totalSold: true,
      status: true,
      _count: {
        select: {
          productLikes: true,
          cartItems: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const items = products.map((p) => ({
    productId: p.id,
    name: p.name,
    thumbnailUrl: storageService.toMediaResponsePath(p.thumbnailUrl) ?? p.thumbnailUrl,
    pricePerUnit: p.pricePerUnit,
    unit: p.unit,
    totalSold: p.totalSold,
    status: p.status,
    likeCount: p._count.productLikes,
    cartCount: p._count.cartItems,
  }));

  const totalLikes = items.reduce((sum, p) => sum + p.likeCount, 0);
  const totalInCart = items.reduce((sum, p) => sum + p.cartCount, 0);

  const topLiked = [...items]
    .filter((p) => p.likeCount > 0)
    .sort((a, b) => b.likeCount - a.likeCount);
  const topInCart = [...items]
    .filter((p) => p.cartCount > 0)
    .sort((a, b) => b.cartCount - a.cartCount);

  return {
    summary: {
      totalLikes,
      totalInCart,
      productCount: items.length,
    },
    products: items,
    topLiked,
    topInCart,
  };
};

export const setProductVideo = async (productId: string, userId: string, videoKey: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { userId: true, video: { select: { url: true } } },
  });
  if (!product || product.userId !== userId) {
    throw new AppError('Produk tidak ditemukan atau bukan milik Anda.', 404);
  }

  const oldKey = product.video?.url;
  await prisma.productVideo.upsert({
    where: { productId },
    create: { productId, url: videoKey },
    update: { url: videoKey },
  });

  if (oldKey && oldKey !== videoKey) {
    await storageService.deleteFile(oldKey).catch(() => undefined);
  }

  return getProductById(productId, userId);
};

export const removeProductVideo = async (productId: string, userId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { userId: true, video: { select: { url: true } } },
  });
  if (!product || product.userId !== userId) {
    throw new AppError('Produk tidak ditemukan atau bukan milik Anda.', 404);
  }

  const oldKey = product.video?.url;
  if (product.video) {
    await prisma.productVideo.delete({ where: { productId } });
  }

  if (oldKey) {
    await storageService.deleteFile(oldKey).catch(() => undefined);
  }

  return getProductById(productId, userId);
};
