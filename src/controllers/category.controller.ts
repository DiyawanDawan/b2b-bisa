import { Request, Response } from 'express';
import * as categoryService from '#services/category.service';
import { successResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import { CATEGORY_TYPE } from '#prisma';

/**
 * GET /api/v1/categories
 */
export const listCategories = catchAsync(async (req: Request, res: Response) => {
  const type = req.query.type as CATEGORY_TYPE;
  const data = await categoryService.listCategories(type);
  return successResponse(res, data, 'Daftar kategori berhasil diambil');
});

/**
 * GET /api/v1/categories/:id
 */
export const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const data = await categoryService.getCategoryById(req.params.id);
  return successResponse(res, data, 'Detail kategori berhasil diambil');
});
