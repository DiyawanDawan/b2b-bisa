import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, successResponse } from '#utils/response.util';
import * as harvestService from '#services/product-harvest.service';

export const listByProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await harvestService.listHarvestLotsByProduct(req.params.productId);
  successResponse(res, data, 'Jadwal panen berhasil diambil.');
});

export const create = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await harvestService.createHarvestLot(req.params.productId, req.user!.id, req.body);
  createdResponse(res, data, 'Batch panen berhasil dibuat.');
});

export const update = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await harvestService.updateHarvestLot(req.params.lotId, req.user!.id, req.body);
  successResponse(res, data, 'Batch panen berhasil diperbarui.');
});

export const confirmHarvest = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await harvestService.confirmHarvestLot(req.params.lotId, req.user!.id, req.body);
  successResponse(res, data, 'Panen berhasil dikonfirmasi.');
});

export const stockIn = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await harvestService.stockInHarvestLot(req.params.lotId, req.user!.id);
  successResponse(res, data, 'Hasil panen berhasil dimasukkan ke stok.');
});

export const cancel = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await harvestService.cancelHarvestLot(
    req.params.lotId,
    req.user!.id,
    req.body?.notes,
  );
  successResponse(res, data, 'Batch panen dibatalkan.');
});
