import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as voucherService from '#services/voucher.service';

export const validateVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code, subtotal, sellerIds } = req.body;
  const result = await voucherService.validateVoucherPreview(
    req.user!.id,
    code,
    subtotal,
    sellerIds,
  );
  successResponse(res, result);
});
