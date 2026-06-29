import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as supplierTradeService from '#services/supplier-trade.service';

export const getTradeStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await supplierTradeService.getSupplierTradeStats(req.params.id);
  successResponse(res, stats, 'Statistik transaksi supplier');
});
