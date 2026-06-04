import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import { AuthRequest } from '#types/index';
import * as platformSettingsService from '#services/platformSettings.service';

export const listForAdmin = catchAsync(async (_req: AuthRequest, res: Response) => {
  const items = await platformSettingsService.listPlatformSettingsForAdmin();
  return successResponse(res, items, 'Pengaturan platform berhasil diambil.');
});

export const upsertForAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { settings } = req.body as { settings: Record<string, string> };
  const items = await platformSettingsService.upsertPlatformSettings(
    settings,
    req.user?.id,
  );
  return successResponse(res, items, 'Pengaturan platform berhasil disimpan.');
});
