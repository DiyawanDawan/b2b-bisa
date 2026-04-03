import { Request, Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse } from '#utils/response.util';
import * as reviewService from '#services/review.service';

/**
 * [BUYER] Post a newly completed Contract Review
 */
export const postReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await reviewService.createReview(req.user!.id, req.body);

  createdResponse(
    res,
    result,
    'Terima kasih! Ulasan Anda telah dipublikasikan dan Rata-Rata Rating Suplayer telah diperbarui.',
  );
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

  res.status(200).json({
    meta: {
      success: true,
      status: 200,
      message: `Daftar ulasan untuk produk tersebut.`,
      pagination: payload.meta,
    },
    data: payload.data,
  });
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

  res.status(200).json({
    meta: {
      success: true,
      status: 200,
      message: `Riwayat ulasan Anda berhasil ditarik.`,
      pagination: payload.meta,
    },
    data: payload.data,
  });
});
