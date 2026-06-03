import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as wishlistService from '#services/wishlist.service';
import { attachWishlistMediaUrls } from '#utils/mediaResolver.util';

export const getWishlist = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await wishlistService.getWishlist(req.user!.id);
  successResponse(res, attachWishlistMediaUrls(result), 'Daftar favorit berhasil diambil.');
});

export const getWishlistIds = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await wishlistService.getWishlistIds(req.user!.id);
  successResponse(res, result, 'ID produk favorit.');
});

export const toggleLike = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId } = req.body;
  const result = await wishlistService.toggleLike(req.user!.id, productId);
  successResponse(
    res,
    result,
    result.liked ? 'Produk ditambahkan ke favorit.' : 'Produk dihapus dari favorit.',
  );
});

export const checkLike = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId } = req.params;
  const result = await wishlistService.isProductLiked(req.user!.id, productId);
  successResponse(res, result, 'Status favorit produk.');
});
