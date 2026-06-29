import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as savedPaymentService from '#services/saved-payment.service';

export const listSaved = catchAsync(async (req: AuthRequest, res: Response) => {
  const items = await savedPaymentService.listSavedPayments(req.user!.id);
  successResponse(res, items);
});

export const setDefault = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await savedPaymentService.setDefaultSavedPayment(
    req.user!.id,
    req.params.id,
  );
  successResponse(res, item, 'Metode pembayaran default diperbarui.');
});

export const removeSaved = catchAsync(async (req: AuthRequest, res: Response) => {
  await savedPaymentService.deleteSavedPayment(req.user!.id, req.params.id);
  successResponse(res, null, 'Metode pembayaran dihapus.');
});
