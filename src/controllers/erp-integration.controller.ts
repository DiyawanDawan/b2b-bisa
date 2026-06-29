import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import * as erpService from '#services/erp-integration.service';

export const listApiKeys = catchAsync(async (req: AuthRequest, res: Response) => {
  const keys = await erpService.listSupplierApiKeys(req.user!.id);
  return successResponse(res, keys, 'Daftar API key integrasi ERP');
});

export const createApiKey = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name } = req.body as { name: string };
  const result = await erpService.createSupplierApiKey(req.user!.id, name);
  return createdResponse(res, result, 'API key berhasil dibuat. Simpan sekali — tidak ditampilkan lagi.');
});

export const revokeApiKey = catchAsync(async (req: AuthRequest, res: Response) => {
  await erpService.revokeSupplierApiKey(req.user!.id, req.params.id);
  return successResponse(res, null, 'API key dicabut');
});

export const exportProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const products = await erpService.exportSupplierProducts(req.user!.id);
  return successResponse(res, products, 'Export produk untuk ERP');
});

export const syncInventory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { items } = req.body as { items: { productId: string; stock: number }[] };
  const result = await erpService.bulkSyncInventory(req.user!.id, items);
  return successResponse(res, result, 'Sinkronisasi stok selesai');
});
