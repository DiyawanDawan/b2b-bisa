import { Request, Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, paginatedResponse, successResponse } from '#utils/response.util';
import * as productQuestionService from '#services/product-question.service';

export const listByProduct = catchAsync(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const payload = await productQuestionService.listProductQuestions(
    productId,
    Math.max(1, page),
    Math.min(50, Math.max(1, limit)),
  );

  return paginatedResponse(
    res,
    payload.data,
    payload.meta.total,
    payload.meta.page,
    payload.meta.limit,
    'Daftar pertanyaan produk.',
  );
});

export const askQuestion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const result = await productQuestionService.askProductQuestion(
    req.user!.id,
    productId,
    req.body.question,
  );
  createdResponse(res, result, 'Pertanyaan Anda telah dikirim ke supplier.');
});

export const answerQuestion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await productQuestionService.answerProductQuestion(
    req.user!.id,
    id,
    req.body.answer,
    req.user!.role,
  );
  successResponse(res, result, 'Jawaban berhasil dipublikasikan.');
});
