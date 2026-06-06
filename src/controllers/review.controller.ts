import { Request, Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, paginatedResponse, successResponse } from '#utils/response.util';
import * as reviewService from '#services/review.service';
import { attachReviewMediaUrls } from '#utils/mediaResolver.util';

/**
 * [BUYER] Post a newly completed Contract Review
 */
export const postReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await reviewService.createReview(req.user!.id, req.body);

  createdResponse(
    res,
    attachReviewMediaUrls(result),
    'Terima kasih! Ulasan Anda telah dipublikasikan dan Rata-Rata Rating Suplayer telah diperbarui.',
  );
});

/**
 * [BUYER] Update an existing Review
 */
export const updateReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reviewId } = req.params;
  const result = await reviewService.updateReview(req.user!.id, reviewId, req.body);

  successResponse(res, attachReviewMediaUrls(result), 'Ulasan Anda berhasil diperbarui.');
});

/**
 * [PUBLIC] Read all Reviews for specific Biomass Product
 */
export const getReviewsByProduct = catchAsync(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const payload = await reviewService.getProductReviews(
    productId,
    Math.max(1, limit),
    Math.max(1, page),
  );

  return paginatedResponse(
    res,
    payload.data.map(attachReviewMediaUrls),
    payload.meta.total,
    payload.meta.page,
    payload.meta.limit,
    'Daftar ulasan untuk produk tersebut.',
  );
});

/**
 * [BUYER] Get My Own Reviews History
 */
export const getMyReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const payload = await reviewService.getBuyerReviews(
    req.user!.id,
    Math.max(1, limit),
    Math.max(1, page),
  );

  return paginatedResponse(
    res,
    payload.data.map(attachReviewMediaUrls),
    payload.meta.total,
    payload.meta.page,
    payload.meta.limit,
    'Riwayat ulasan Anda berhasil ditarik.',
  );
});

/**
 * [PUBLIC] Get Review Summary for a Product (Rating Badge)
 */
/**
 * [SUPPLIER] Reply to a product review
 */
export const replyReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reviewId } = req.params;
  const { reply } = req.body as { reply: string };
  const result = await reviewService.replyToReview(req.user!.id, reviewId, reply);

  successResponse(res, attachReviewMediaUrls(result), 'Balasan ulasan berhasil dipublikasikan.');
});

export const getReviewSummary = catchAsync(async (req: Request, res: Response) => {
  const { productId } = req.params;

  const summary = await reviewService.getReviewSummary(productId);

  successResponse(res, summary, 'Ringkasan rating produk berhasil ditarik.');
});
