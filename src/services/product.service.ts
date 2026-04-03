import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { Prisma, BiomassaType, BiocharGrade, ProductStatus, OrderStatus } from '#prisma';

type CreateProductInput = {
  name: string;
  biomassaType: BiomassaType;
  grade?: BiocharGrade;
  description?: string;
  pricePerUnit: number;
  stock: number;
  minOrder?: number;
  unit: 'KG' | 'TON';
  status?: ProductStatus;
  categoryId?: string;
  province?: string;
  regency?: string;
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
  // Validate: grade is required for BIOCHAR
  if (data.biomassaType === BiomassaType.BIOCHAR && !data.grade) {
    throw new AppError('Grade wajib diisi untuk produk Biochar (A, B, atau C).', 400);
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
    ...productData
  } = data;

  const thumbnailUrl = imageUrls.length > 0 ? imageUrls[0] : null;

  return prisma.product.create({
    data: {
      ...productData,
      pricePerUnit: new Prisma.Decimal(pricePerUnit),
      stock: new Prisma.Decimal(stock),
      minOrder: minOrder ? new Prisma.Decimal(minOrder) : new Prisma.Decimal(100),
      thumbnailUrl,
      userId,
      technicalSpec: {
        create: {
          moistureContent: moistureContent ? new Prisma.Decimal(moistureContent) : null,
          carbonPurity: carbonPurity ? new Prisma.Decimal(carbonPurity) : null,
          productionCapacity: productionCapacity ? new Prisma.Decimal(productionCapacity) : null,
          surfaceArea: surfaceArea ? new Prisma.Decimal(surfaceArea) : null,
          phLevel: phLevel ? new Prisma.Decimal(phLevel) : null,
          density,
          carbonOffsetPerTon: carbonOffsetPerTon ? new Prisma.Decimal(carbonOffsetPerTon) : null,
          grossWeightPerSak: grossWeightPerSak ? new Prisma.Decimal(grossWeightPerSak) : null,
          netWeightPerSak: netWeightPerSak ? new Prisma.Decimal(netWeightPerSak) : null,
          bagDimension,
        },
      },
      images: {
        create: imageUrls.map((url, index) => ({
          url,
          isPrimary: index === 0,
          order: index,
        })),
      },
    },
    include: {
      category: true,
      technicalSpec: true,
      images: true,
      user: { select: { id: true, fullName: true, province: true, regency: true } },
    },
  });
};

export const listProducts = async (filters: {
  search?: string;
  status?: ProductStatus;
  userId?: string;
  biomassaType?: BiomassaType;
  grade?: BiocharGrade;
  province?: string;
  minPrice?: number;
  maxPrice?: number;
  minStock?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}) => {
  const {
    search,
    status,
    userId,
    biomassaType,
    grade,
    province,
    minPrice,
    maxPrice,
    minStock,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10,
  } = filters;

  const where: Prisma.ProductWhereInput = {
    ...(userId && { userId }),
    status: status || (userId ? { not: ProductStatus.DELETED } : ProductStatus.ACTIVE),
    ...(search && {
      OR: [{ name: { startsWith: search } }, { description: { startsWith: search } }],
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
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        category: true,
        technicalSpec: true,
        images: true,
        user: {
          select: { id: true, fullName: true, avatarUrl: true, province: true, regency: true },
        },
      },
    }),
  ]);
  return { total, page, limit, products };
};

export const getProductById = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      technicalSpec: true,
      images: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          province: true,
          regency: true,
        },
      },
    },
  });
  if (!product || product.status !== ProductStatus.ACTIVE)
    throw new AppError('Produk tidak ditemukan.', 404);
  return product;
};

export const updateProduct = async (
  id: string,
  userId: string,
  data: Partial<CreateProductInput>,
  imageUrls: string[] = [],
) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId !== userId)
    throw new AppError('Anda tidak memiliki akses untuk mengubah produk ini.', 403);

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
    ...productUpdateData
  } = data;

  const thumbnailUrl = imageUrls.length > 0 ? imageUrls[0] : undefined;

  return prisma.product.update({
    where: { id },
    data: {
      ...productUpdateData,
      ...(thumbnailUrl && { thumbnailUrl }),
      ...(pricePerUnit !== undefined && { pricePerUnit: new Prisma.Decimal(pricePerUnit) }),
      ...(stock !== undefined && { stock: new Prisma.Decimal(stock) }),
      ...(minOrder !== undefined && { minOrder: new Prisma.Decimal(minOrder) }),
      technicalSpec: {
        upsert: {
          create: {
            moistureContent: moistureContent ? new Prisma.Decimal(moistureContent) : null,
            carbonPurity: carbonPurity ? new Prisma.Decimal(carbonPurity) : null,
            productionCapacity: productionCapacity ? new Prisma.Decimal(productionCapacity) : null,
            surfaceArea: surfaceArea ? new Prisma.Decimal(surfaceArea) : null,
            phLevel: phLevel ? new Prisma.Decimal(phLevel) : null,
            density,
            carbonOffsetPerTon: carbonOffsetPerTon ? new Prisma.Decimal(carbonOffsetPerTon) : null,
            grossWeightPerSak: grossWeightPerSak ? new Prisma.Decimal(grossWeightPerSak) : null,
            netWeightPerSak: netWeightPerSak ? new Prisma.Decimal(netWeightPerSak) : null,
            bagDimension,
          },
          update: {
            ...(moistureContent !== undefined && {
              moistureContent: new Prisma.Decimal(moistureContent),
            }),
            ...(carbonPurity !== undefined && { carbonPurity: new Prisma.Decimal(carbonPurity) }),
            ...(productionCapacity !== undefined && {
              productionCapacity: new Prisma.Decimal(productionCapacity),
            }),
            ...(surfaceArea !== undefined && { surfaceArea: new Prisma.Decimal(surfaceArea) }),
            ...(phLevel !== undefined && { phLevel: new Prisma.Decimal(phLevel) }),
            ...(density !== undefined && { density }),
            ...(carbonOffsetPerTon !== undefined && {
              carbonOffsetPerTon: new Prisma.Decimal(carbonOffsetPerTon),
            }),
            ...(grossWeightPerSak !== undefined && {
              grossWeightPerSak: new Prisma.Decimal(grossWeightPerSak),
            }),
            ...(netWeightPerSak !== undefined && {
              netWeightPerSak: new Prisma.Decimal(netWeightPerSak),
            }),
            ...(bagDimension !== undefined && { bagDimension }),
          },
        },
      },
      ...(imageUrls.length > 0 && {
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
    include: {
      technicalSpec: true,
      images: true,
    },
  });
};

export const deleteProduct = async (id: string, userId: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
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
    return { message: 'Produk berhasil dihapus secara permanen.' };
  } else {
    await prisma.product.update({
      where: { id },
      data: { status: ProductStatus.DELETED },
    });
    return { message: 'Produk berhasil dihapus (Riwayat transaksi diarsipkan).' };
  }
};
