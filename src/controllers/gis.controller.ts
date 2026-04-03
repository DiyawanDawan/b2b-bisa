import { Request, Response } from 'express';
import { successResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import { BiomassaType } from '#prisma';
import * as gisService from '#services/gis.service';

/**
 * GET /api/v1/gis
 * Fetch regions based on level and parentId
 */
export const getRegions = catchAsync(async (req: Request, res: Response) => {
  const level = (req.query.level as string) || 'country';
  const parentId = req.query.parentId as string;
  const search = req.query.search as string;

  const data = await gisService.getRegions(level as string, parentId as string, search as string);
  return successResponse(res, data, `Daftar ${level} berhasil diambil`);
});

export const getWasteMap = catchAsync(async (req: Request, res: Response) => {
  const { province, type } = req.query as { province?: string; type?: BiomassaType };
  const result = await gisService.getWasteDistributionMap({
    province: province as string,
    type: type as BiomassaType,
  });
  successResponse(res, result, 'Data sebaran limbah');
});

export const matchSupplyDemand = catchAsync(async (req: Request, res: Response) => {
  const { type, regency } = req.body;
  const result = await gisService.matchSupplyDemand(type, regency);
  successResponse(res, result, 'Daftar penawaran yang sesuai');
});
