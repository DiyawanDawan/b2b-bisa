import { Response, Request } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as productService from '#services/product.service';
import { ProductStatus } from '#prisma';

interface ProductQuery {
  page?: string;
  limit?: string;
  search?: string;
  status?: ProductStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  categoryId?: string;
  biomassaType?: any; // From Prisma model
  grade?: any; // From Prisma model
  province?: string;
  regency?: string;
  minPrice?: string;
  maxPrice?: string;
  minStock?: string;
  userId?: string;
}

/**
 * POST /api/v1/products
 */
export const createProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const imageUrls = files?.map((f) => `pending_upload_${f.originalname}`) || [];
  const product = await productService.createProduct(req.user!.id, req.body, imageUrls);
  return createdResponse(res, product, 'Produk berhasil ditambahkan');
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
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page,
    limit,
  };

  const { products, total } = await productService.listProducts(filters);
  return paginatedResponse(res, products, total, page, limit, 'Daftar produk berhasil diambil');
});

/**
 * GET /api/v1/products/me
 * Supplier Dashboard: List only current supplier's products
 */
export const getMyProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = req.query as ProductQuery;
  const page = parseInt(query.page || '1') || 1;
  const limit = parseInt(query.limit || '10') || 10;
  const user = req.user!;

  const filters = {
    search: query.search,
    status: query.status,
    userId: user.id,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page,
    limit,
  };

  const { products, total } = await productService.listProducts(filters);
  return paginatedResponse(
    res,
    products,
    total,
    page,
    limit,
    'Daftar produk Anda berhasil diambil',
  );
});

/**
 * GET /api/v1/products/:id
 * Get detail product
 */
export const getProductById = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await productService.getProductById(req.params.id);

  // Privacy Protection: Hide contact info from guests (not logged in)
  if (!req.user && product && 'user' in product && product.user) {
    const user = product.user as any;
    user.email = undefined;
    user.phone = undefined;
  }

  return successResponse(res, product, 'Detail produk berhasil diambil');
});

/**
 * PATCH /api/v1/products/:id
 */
export const updateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const imageUrls = files?.map((f) => `pending_upload_${f.originalname}`) || [];
  const product = await productService.updateProduct(
    req.params.id,
    req.user!.id,
    req.body,
    imageUrls,
  );
  return successResponse(res, product, 'Produk berhasil diperbarui');
});

/**
 * DELETE /api/v1/products/:id
 */
export const deleteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  await productService.deleteProduct(req.params.id, req.user!.id);
  return successResponse(res, null, 'Produk berhasil dihapus');
});
