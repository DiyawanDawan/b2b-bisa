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
  const { lat, lng, radius, biomassaType, regency, province, type } = req.body as {
    lat?: number;
    lng?: number;
    radius?: number;
    biomassaType?: BiomassaType;
    regency?: string;
    province?: string;
    type?: BiomassaType;
  };

  if (lat != null && lng != null) {
    const result = await gisService.matchSupplyDemandByLocation({
      lat: Number(lat),
      lng: Number(lng),
      radiusKm: radius != null ? Number(radius) : undefined,
      biomassaType: biomassaType ?? type,
      regency,
      province,
    });
    return successResponse(res, result, 'Produk & supplier terdekat');
  }

  if (!type) {
    return successResponse(
      res,
      { radius: 0, matches: [] },
      'Parameter lokasi atau tipe biomass wajib',
    );
  }

  const legacy = await gisService.matchSupplyDemand(type, regency);
  return successResponse(res, legacy, 'Daftar penawaran yang sesuai');
});
