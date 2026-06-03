import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as cartService from '#services/cart.service';

export const getCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await cartService.getCart(req.user!.id);
  successResponse(res, result, 'Keranjang berhasil diambil.');
});

export const getCartCount = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await cartService.getCartCount(req.user!.id);
  successResponse(res, result, 'Jumlah item keranjang.');
});

export const addToCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const { productId, quantity } = req.body;
  const result = await cartService.addToCart(req.user!.id, productId, quantity);
  successResponse(res, result, 'Produk ditambahkan ke keranjang.');
});

export const updateCartItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const result = await cartService.updateCartItem(req.user!.id, id, quantity);
  successResponse(res, result, 'Keranjang diperbarui.');
});

export const removeCartItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await cartService.removeCartItem(req.user!.id, id);
  successResponse(res, result, 'Item dihapus dari keranjang.');
});

export const clearCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await cartService.clearCart(req.user!.id);
  successResponse(res, result, 'Keranjang dikosongkan.');
});
