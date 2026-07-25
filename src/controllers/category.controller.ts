import { Request, Response } from 'express';
import * as categoryService from '#services/category.service';
import * as productService from '#services/product.service';
import { successResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import { BiomassaType, CATEGORY_TYPE, ProductMode } from '#prisma';

/**
 * GET /api/v1/categories
 * Query params:
 *  - categoryType | type : PRODUK | FORUM | ARTICLE
 *  - productMode         : BIOMASS_MATERIAL | ORGANIC_PRODUCE
 *  - biomassaType        : BIOCHAR | SEKAM_PADI | ... (biomass shelf only)
 *  - search              : filter by name/description
 *  - parentId            : children of a node
 *  - leavesOnly          : true|false (PRODUK defaults to leaf/L3)
 */
export const listCategories = catchAsync(async (req: Request, res: Response) => {
  const type = (req.query.categoryType || req.query.type) as CATEGORY_TYPE;
  const productMode = req.query.productMode as ProductMode | undefined;
  const biomassaType = req.query.biomassaType as BiomassaType | undefined;
  const search = req.query.search as string | undefined;
  const parentIdRaw = req.query.parentId as string | undefined;
  const leavesOnlyRaw = req.query.leavesOnly as string | undefined;
  const leavesOnly =
    leavesOnlyRaw === 'true' ? true : leavesOnlyRaw === 'false' ? false : undefined;

  const data = await categoryService.listCategories({
    type,
    productMode,
    biomassaType,
    search,
    leavesOnly,
    parentId: parentIdRaw === 'null' ? null : parentIdRaw,
  });
  return successResponse(res, data, 'Daftar kategori berhasil diambil');
});

/**
 * GET /api/v1/categories/tree
 * Nested L1 → L2 → L3 for product category pickers.
 */
export const getCategoryTree = catchAsync(async (req: Request, res: Response) => {
  const type = (req.query.categoryType || req.query.type || 'PRODUK') as CATEGORY_TYPE;
  const productMode = req.query.productMode as ProductMode | undefined;
  const biomassaType = req.query.biomassaType as BiomassaType | undefined;

  const data = await categoryService.getCategoryTree({
    type,
    productMode,
    biomassaType,
  });
  return successResponse(res, data, 'Pohon kategori berhasil diambil');
});

/**
 * GET /api/v1/categories/:id
 */
export const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const data = await categoryService.getCategoryById(req.params.id);
  return successResponse(res, data, 'Detail kategori berhasil diambil');
});

/**
 * GET /api/v1/categories/:id/products
 */
export const listCategoryProducts = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page, limit, productMode } = req.query;

  const data = await productService.listProducts({
    categoryId: id,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 10,
    productMode: productMode as ProductMode | undefined,
  });

  return successResponse(res, data, 'Daftar produk dalam kategori berhasil diambil');
});
