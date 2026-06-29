import { Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as aiService from '#services/ai.service';
import { AuthRequest } from '#types/index';

/**
 * Predict biochar quality based on input parameters (Pyrolysis)
 */
export const predictQuality = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await aiService.predictBiocharQuality(req.user!.id, req.body);
  successResponse(res, result, 'Prediksi kualitas biochar berhasil');
});

/**
 * AI Chatbot / Assistant for agriculture and biochar
 */
export const chatAssistant = catchAsync(async (req: AuthRequest, res: Response) => {
  const { question } = req.body;
  const answer = await aiService.askAssistant(question);
  successResponse(res, { answer }, 'Jawaban asisten AI');
});

export const listRecentPredictions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { limit, iotOnly } = req.query as { limit?: string; iotOnly?: string };
  const result = await aiService.listRecentPredictions(req.user!.id, {
    limit: limit ? Number(limit) : 20,
    iotOnly: iotOnly === 'true',
  });
  successResponse(res, { predictions: result }, 'Riwayat prediksi berhasil dimuat');
});
