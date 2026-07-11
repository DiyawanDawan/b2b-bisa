import { Response, Request } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import AppError from '#utils/appError';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as productService from '#services/product.service';
import * as productPromotionService from '#services/product-promotion.service';
import { ProductStatus, BiomassaType, BiocharGrade, ProductMode } from '#prisma';
import * as storageService from '#services/storage.service';
import * as mediaUploadService from '#services/mediaUpload.service';
import { attachProductMediaUrls } from '#utils/productMedia.util';
import prisma from '#config/prisma';

interface ProductQuery {
  page?: string;
  limit?: string;
  search?: string;
  status?: ProductStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  categoryId?: string;
  biomassaType?: BiomassaType;
  grade?: BiocharGrade;
  province?: string;
  regency?: string;
  minPrice?: string;
  maxPrice?: string;
  minStock?: string;
  userId?: string;
  productMode?: ProductMode;
  cropType?: string;
  isChemicalFree?: string | boolean;
}

type ImageOrderItem = {
  type: 'existing' | 'new';
  url?: string;
  index?: number;
};

async function uploadProductImages(
  files: Express.Multer.File[] | undefined,
  userId: string,
): Promise<string[]> {
  if (!files?.length) return [];

  const ts = Date.now();
  const uploaded: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.originalname.split('.').pop() || 'jpg';
      const path = `products/${userId}/${ts}_${i}.${ext}`;
      const key = await storageService.uploadFile(file.buffer, path, file.mimetype);
      uploaded.push(key);
    }
    return uploaded;
  } catch (error) {
    await Promise.all(uploaded.map((key) => storageService.deleteFile(key)));
    throw error;
  }
}

async function rollbackUploadedKeys(keys: string[]) {
  await Promise.all(keys.map((key) => storageService.deleteFile(key)));
}

function parseImageOrder(imageOrderRaw: string): ImageOrderItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(imageOrderRaw);
  } catch {
    throw new AppError('Format imageOrder tidak valid (JSON rusak).', 400);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new AppError('imageOrder harus berupa array foto yang tidak kosong.', 400);
  }

  return parsed as ImageOrderItem[];
}

function resolveImageUrls(uploadedUrls: string[], imageOrderRaw?: string): string[] {
  if (!imageOrderRaw) return uploadedUrls;

  const order = parseImageOrder(imageOrderRaw);

  return order.map((item, position) => {
    if (item.type === 'existing') {
      if (!item.url?.trim()) {
        throw new AppError(`URL foto existing kosong pada posisi ${position + 1}.`, 400);
      }
      return storageService.normalizeStorageKey(item.url) ?? item.url.trim();
    }

    if (item.type === 'new') {
      if (item.index === undefined || item.index < 0 || item.index >= uploadedUrls.length) {
        throw new AppError(
          `Index foto baru tidak valid pada posisi ${position + 1} (harus 0–${uploadedUrls.length - 1}).`,
          400,
        );
      }
      return uploadedUrls[item.index];
    }

    throw new AppError(`Tipe item imageOrder tidak valid pada posisi ${position + 1}.`, 400);
  });
}

async function validateExistingImageOwnership(
  productId: string,
  userId: string,
  imageUrls: string[],
  imageOrderRaw?: string,
) {
  if (!imageOrderRaw) return;

  const order = parseImageOrder(imageOrderRaw);
  const hasExisting = order.some((item) => item.type === 'existing');
  if (!hasExisting) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      userId: true,
      images: { select: { url: true } },
    },
  });

  if (!product) throw new AppError('Produk tidak ditemukan.', 404);
  if (product.userId !== userId) {
    throw new AppError('Anda tidak memiliki akses untuk mengubah produk ini.', 403);
  }

  const allowed = new Set(
    product.images
      .map((img) => storageService.normalizeStorageKey(img.url) ?? img.url)
      .filter(Boolean),
  );

  for (const item of order) {
    if (item.type !== 'existing' || !item.url) continue;
    const key = storageService.normalizeStorageKey(item.url) ?? item.url.trim();
    if (storageService.isExternalMediaUrl(key)) continue;
    if (!allowed.has(key)) {
      throw new AppError('Foto existing tidak valid atau bukan milik produk ini.', 400);
    }
  }

  for (const url of imageUrls) {
    const key = storageService.normalizeStorageKey(url) ?? url;
    if (storageService.isExternalMediaUrl(key)) continue;
    if (key.startsWith(`products/${userId}/`)) continue;
    if (!allowed.has(key)) {
      throw new AppError('Daftar foto produk mengandung URL yang tidak diizinkan.', 400);
    }
  }
}

function parseImageUrlsField(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      throw new AppError('Format imageUrls tidak valid (JSON rusak).', 400);
    }
  }
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function assertImagePayload(
  imageUrls: string[],
  syncImages: boolean,
  status?: ProductStatus,
  filesUploaded = 0,
  hasImageOrder = false,
  preUploadedCount = 0,
) {
  if (filesUploaded > 0 && !hasImageOrder) {
    throw new AppError('imageOrder wajib dikirim saat mengunggah foto produk.', 400);
  }

  if (preUploadedCount > 0 && filesUploaded === 0 && imageUrls.length === 0) {
    throw new AppError('imageUrls hasil upload tidak valid.', 400);
  }

  if (syncImages && imageUrls.length === 0) {
    throw new AppError(
      'Sinkronisasi foto gagal: daftar foto kosong. Minimal satu foto diperlukan.',
      400,
    );
  }

  if (status === ProductStatus.ACTIVE && imageUrls.length === 0) {
    throw new AppError('Produk ACTIVE wajib memiliki minimal satu foto.', 400);
  }
}

/**
 * POST /api/v1/products
 */
export const createProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  let uploadedUrls: string[] = [];

  try {
    const preUploaded = parseImageUrlsField(req.body.imageUrls);
    if (preUploaded.length > 0) {
      mediaUploadService.validatePreUploadedPaths(preUploaded, req.user!.id, 'products');
    }

    uploadedUrls = await uploadProductImages(files, req.user!.id);
    const imageOrderRaw = req.body.imageOrder as string | undefined;

    let imageUrls: string[];
    if (imageOrderRaw) {
      imageUrls = resolveImageUrls(uploadedUrls, imageOrderRaw);
    } else if (preUploaded.length > 0) {
      imageUrls = preUploaded;
    } else {
      imageUrls = uploadedUrls;
    }

    assertImagePayload(
      imageUrls,
      false,
      req.body.status as ProductStatus | undefined,
      files?.length ?? 0,
      !!imageOrderRaw,
      preUploaded.length,
    );

    const {
      imageOrder: _imageOrder,
      syncImages: _syncImages,
      imageUrls: _imageUrls,
      ...body
    } = req.body;
    const product = await productService.createProduct(req.user!.id, body, imageUrls);
    return createdResponse(res, attachProductMediaUrls(product), 'Produk berhasil ditambahkan');
  } catch (error) {
    await rollbackUploadedKeys(uploadedUrls);
    throw error;
  }
});

/**
 * GET /api/v1/products
 */
export const listProducts = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as ProductQuery;
  const page = parseInt(query.page || '1') || 1;
  const limit = parseInt(query.limit || '10') || 10;

  const user = (req as AuthRequest).user;
  const forcedStatus: ProductStatus =
    !user || user.role === 'BUYER'
      ? ProductStatus.ACTIVE
      : (query.status as ProductStatus) || ProductStatus.ACTIVE;

  const isChemicalFreeVal =
    query.isChemicalFree !== undefined
      ? query.isChemicalFree === 'true' || query.isChemicalFree === true
      : undefined;

  const filters = {
    search: query.search,
    userId: query.userId,
    status: forcedStatus,
    categoryId: query.categoryId,
    biomassaType: query.biomassaType,
    grade: query.grade,
    province: query.province,
    regency: query.regency,
    minPrice: query.minPrice ? parseFloat(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? parseFloat(query.maxPrice) : undefined,
    minStock: query.minStock ? parseFloat(query.minStock) : undefined,
    productMode: query.productMode,
    cropType: query.cropType,
    isChemicalFree: isChemicalFreeVal,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page,
    limit,
  };

  const { products, total } = await productService.listProducts(filters);
  return paginatedResponse(
    res,
    products.map(attachProductMediaUrls),
    total,
    page,
    limit,
    'Daftar produk berhasil diambil',
  );
});

/**
 * GET /api/v1/products/me
 */
export const getMyProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = req.query as ProductQuery;
  const page = parseInt(query.page || '1') || 1;
  const limit = parseInt(query.limit || '10') || 10;
  const user = req.user!;

  const isChemicalFreeVal =
    query.isChemicalFree !== undefined
      ? query.isChemicalFree === 'true' || query.isChemicalFree === true
      : undefined;

  const filters = {
    search: query.search,
    status: query.status,
    userId: user.id,
    biomassaType: query.biomassaType,
    grade: query.grade,
    province: query.province,
    regency: query.regency,
    productMode: query.productMode,
    cropType: query.cropType,
    isChemicalFree: isChemicalFreeVal,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page,
    limit,
  };

  const { products, total } = await productService.listProducts(filters);
  return paginatedResponse(
    res,
    products.map(attachProductMediaUrls),
    total,
    page,
    limit,
    'Daftar produk Anda berhasil diambil',
  );
});

/**
 * GET /api/v1/products/:id
 */
export const getProductRecommendations = catchAsync(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 8, 20);
  const items = await productService.getProductRecommendations(req.params.id, limit);
  return successResponse(
    res,
    items.map((p) => attachProductMediaUrls(p)),
    'Rekomendasi produk berhasil diambil',
  );
});

export const getProductById = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.getProductById(req.params.id, req.user?.id);

  if (!req.user && product && 'user' in product && product.user) {
    const user = product.user as { email?: string | null; phone?: string | null };
    user.email = undefined;
    user.phone = undefined;
  }

  return successResponse(res, attachProductMediaUrls(product), 'Detail produk berhasil diambil');
});

/**
 * PATCH /api/v1/products/:id
 */
export const updateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const imageOrder = req.body.imageOrder as string | undefined;
  const syncImages = req.body.syncImages === 'true' || req.body.syncImages === true || !!imageOrder;

  let uploadedUrls: string[] = [];

  try {
    const preUploaded = parseImageUrlsField(req.body.imageUrls);
    if (preUploaded.length > 0) {
      mediaUploadService.validatePreUploadedPaths(preUploaded, req.user!.id, 'products');
    }

    uploadedUrls = await uploadProductImages(files, req.user!.id);

    if ((files?.length ?? 0) > 0 && !imageOrder) {
      throw new AppError('imageOrder wajib dikirim saat mengunggah foto produk.', 400);
    }

    let imageUrls: string[];
    if (imageOrder) {
      imageUrls = resolveImageUrls(uploadedUrls, imageOrder);
    } else if (preUploaded.length > 0) {
      imageUrls = preUploaded;
    } else {
      imageUrls = uploadedUrls;
    }

    if (syncImages || imageOrder) {
      await validateExistingImageOwnership(req.params.id, req.user!.id, imageUrls, imageOrder);
    }

    const nextStatus = req.body.status as ProductStatus | undefined;
    if (syncImages) {
      assertImagePayload(imageUrls, true, nextStatus, files?.length ?? 0, !!imageOrder);
    } else if (nextStatus === ProductStatus.ACTIVE) {
      const current = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: { images: { select: { id: true } }, status: true },
      });
      const willHaveImages = imageUrls.length > 0 || (current?.images.length ?? 0) > 0;
      if (!willHaveImages) {
        throw new AppError('Produk ACTIVE wajib memiliki minimal satu foto.', 400);
      }
    }

    const {
      imageOrder: _imageOrder,
      syncImages: _syncImages,
      imageUrls: _imageUrls,
      ...body
    } = req.body;
    const product = await productService.updateProduct(
      req.params.id,
      req.user!.id,
      body,
      imageUrls,
      syncImages,
    );
    return successResponse(res, attachProductMediaUrls(product), 'Produk berhasil diperbarui');
  } catch (error) {
    await rollbackUploadedKeys(uploadedUrls);
    throw error;
  }
});

/**
 * DELETE /api/v1/products/:id
 */
export const deleteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  await productService.deleteProduct(req.params.id, req.user!.id);
  return successResponse(res, null, 'Produk berhasil dihapus');
});

/**
 * GET /api/v1/products/:id/stats
 */
export const getProductStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await productService.getProductStats(req.params.id, req.user!.id);
  return successResponse(res, stats, 'Statistik produk berhasil diambil');
});

/**
 * GET /api/v1/products/engagement
 */
export const getSupplierEngagement = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await productService.getSupplierProductEngagement(req.user!.id);
  return successResponse(res, data, 'Data minat produk berhasil diambil');
});

/**
 * POST /api/v1/products/:id/duplicate
 */
export const duplicateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.duplicateProduct(req.params.id, req.user!.id);
  return createdResponse(res, attachProductMediaUrls(product), 'Produk berhasil diduplikasi');
});

/**
 * GET /api/v1/products/featured
 */
export const getFeaturedProducts = catchAsync(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 6;
  const products = await productService.getFeaturedProducts(Math.max(1, limit));

  return successResponse(
    res,
    products.map(attachProductMediaUrls),
    'Daftar produk unggulan terverifikasi.',
  );
});

/**
 * GET /api/v1/products/collections
 */
export const getCollections = catchAsync(async (req: Request, res: Response) => {
  const collections = await productService.listCollections();
  return successResponse(res, collections, 'Daftar koleksi produk berhasil diambil');
});

/**
 * GET /api/v1/products/collections/:slug
 */
export const getCollectionProducts = catchAsync(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const products = await productService.getProductsByCollection(slug, page, limit);

  return successResponse(
    res,
    products.map(attachProductMediaUrls),
    `Daftar produk dalam koleksi ${slug} berhasil diambil`,
  );
});

/**
 * POST /api/v1/products/:id/promote
 */
export const promoteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const days = parseInt(req.body.days as string) || productPromotionService.PROMOTE_DAYS;
  const result = await productPromotionService.promoteProduct(req.user!.id, req.params.id, days);
  return successResponse(res, result, 'Produk berhasil dipromosikan');
});

/**
 * POST /api/v1/products/:id/promo-impression
 */
export const recordPromoImpression = catchAsync(async (req: Request, res: Response) => {
  const result = await productPromotionService.recordPromoImpression(req.params.id);
  return successResponse(res, result, 'Impression dicatat');
});

/**
 * POST /api/v1/products/:id/promo-click
 */
export const recordPromoClick = catchAsync(async (req: Request, res: Response) => {
  const result = await productPromotionService.recordPromoClick(req.params.id);
  return successResponse(res, result, 'Klik promosi dicatat');
});

/**
 * POST /api/v1/products/:id/video
 */
export const uploadProductVideo = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new AppError('File video wajib diunggah.', 400);
  }

  const ext = file.originalname.split('.').pop() || 'mp4';
  const path = `products/${req.user!.id}/videos/${req.params.id}_${Date.now()}.${ext}`;
  const key = await storageService.uploadFile(file.buffer, path, file.mimetype);

  try {
    const product = await productService.setProductVideo(req.params.id, req.user!.id, key);
    return successResponse(res, attachProductMediaUrls(product), 'Video produk berhasil diunggah');
  } catch (error) {
    await storageService.deleteFile(key);
    throw error;
  }
});

/**
 * DELETE /api/v1/products/:id/video
 */
export const deleteProductVideo = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.removeProductVideo(req.params.id, req.user!.id);
  return successResponse(res, attachProductMediaUrls(product), 'Video produk dihapus');
});
