import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import { AuthRequest } from '#types/index';
import AppError from '#utils/appError';
import * as storeBannerService from '#services/storeBanner.service';

export const listMyStoreBanners = catchAsync(async (req: AuthRequest, res: Response) => {
  const banners = await storeBannerService.listStoreBanners(req.user!.id, {
    ownerId: req.user!.id,
  });
  successResponse(res, banners, 'Daftar banner toko');
});

export const listUserStoreBanners = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const banners = await storeBannerService.listStoreBanners(userId, {
    activeOnly: true,
    ownerId: req.user?.id,
  });
  successResponse(res, banners, 'Banner toko supplier');
});

export const createStoreBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw new AppError('File banner wajib diunggah.', 400);

  const { title } = req.body as { title?: string };
  const banner = await storeBannerService.createStoreBanner(req.user!.id, file, { title });
  createdResponse(res, banner, 'Banner toko berhasil ditambahkan');
});

export const updateStoreBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const { bannerId } = req.params;
  const { title, sortOrder, isActive } = req.body as {
    title?: string;
    sortOrder?: number;
    isActive?: boolean;
  };

  const banner = await storeBannerService.updateStoreBanner(req.user!.id, bannerId, {
    title,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
    isActive,
  });
  successResponse(res, banner, 'Banner toko berhasil diperbarui');
});

export const deleteStoreBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const { bannerId } = req.params;
  const result = await storeBannerService.deleteStoreBanner(req.user!.id, bannerId);
  successResponse(res, result, 'Banner toko berhasil dihapus');
});
