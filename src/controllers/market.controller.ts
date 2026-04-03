import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as marketService from '#services/market.service';
import { AuthRequest } from '#middlewares/authMiddleware';
import { TrendCategory } from '#prisma';

/**
 * Get all market trends (options to filter by category)
 */
export const getMarketTrends = catchAsync(async (req: AuthRequest, res: Response) => {
  const { category } = req.query;
  const result = await marketService.getMarketTrends(category as TrendCategory);
  successResponse(res, result, 'Data tren pasar berhasil dimuat');
});

/**
 * Get specific prediction and insight based on a market trend ID
 */
export const getPrediction = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await marketService.getPrediction(id);
  successResponse(res, result, 'Prediksi dan analisis cerdas berhasil dimuat');
});
