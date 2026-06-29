import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as voucherService from '#services/voucher.service';
import { VoucherScope, VoucherType } from '#prisma';

export const listVouchers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const items = await voucherService.listVouchersAdmin();
  successResponse(res, items, 'Daftar voucher berhasil diambil.');
});

export const createVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const body = req.body;
  const item = await voucherService.createVoucherAdmin({
    code: body.code,
    type: body.type as VoucherType,
    value: body.value,
    minOrderAmount: body.minOrderAmount,
    maxDiscount: body.maxDiscount,
    scope: (body.scope as VoucherScope) ?? VoucherScope.PLATFORM,
    supplierId: body.supplierId,
    usageLimit: body.usageLimit,
    usagePerUser: body.usagePerUser,
    startsAt: body.startsAt,
    expiresAt: body.expiresAt,
    isActive: body.isActive,
  });
  successResponse(res, item, 'Voucher berhasil dibuat.', 201);
});

export const updateVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await voucherService.updateVoucherAdmin(req.params.id, req.body);
  successResponse(res, item, 'Voucher berhasil diperbarui.');
});
