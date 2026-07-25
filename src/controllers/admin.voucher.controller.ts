import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { paginatedResponse, successResponse } from '#utils/response.util';
import * as voucherService from '#services/voucher.service';
import * as adminService from '#services/admin.service';
import { VoucherScope, VoucherType } from '#prisma';

export const listVouchers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search, isActive, period } = req.query as {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    period?: 'active_now' | 'upcoming' | 'expired';
  };
  const result = await voucherService.listVouchersAdmin({
    page,
    limit,
    search,
    isActive,
    period,
  });
  paginatedResponse(
    res,
    result.items,
    result.total,
    result.page,
    result.limit,
    'Daftar voucher berhasil diambil.',
  );
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
    categoryId: body.categoryId,
    productId: body.productId,
    productMode: body.productMode,
    usageLimit: body.usageLimit,
    usagePerUser: body.usagePerUser,
    startsAt: body.startsAt,
    expiresAt: body.expiresAt,
    isActive: body.isActive,
  });

  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'CREATE_VOUCHER',
    entity: 'VOUCHER',
    entityId: item.id,
    newValue: {
      code: item.code,
      type: item.type,
      scope: item.scope,
      supplierId: item.supplierId,
      categoryId: item.categoryId,
      productId: item.productId,
      productMode: item.productMode,
    },
  });

  successResponse(res, item, 'Voucher berhasil dibuat.', 201);
});

export const updateVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reason, ...payload } = req.body as Record<string, unknown>;
  const item = await voucherService.updateVoucherAdmin(req.params.id, payload);

  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'UPDATE_VOUCHER',
    entity: 'VOUCHER',
    entityId: item.id,
    newValue: { ...payload, ...(typeof reason === 'string' ? { reason } : {}) },
  });

  successResponse(res, item, 'Voucher berhasil diperbarui.');
});

export const getVoucherUsage = catchAsync(async (req: AuthRequest, res: Response) => {
  const detail = await voucherService.getVoucherUsageAdmin(req.params.id);
  successResponse(res, detail, 'Detail pemakaian voucher berhasil diambil.');
});

export const deleteVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
  const result = await voucherService.deleteOrDisableVoucherAdmin(req.params.id);

  await adminService.createAuditLog({
    userId: req.user!.id,
    action: result.action === 'deleted' ? 'DELETE_VOUCHER' : 'DISABLE_VOUCHER',
    entity: 'VOUCHER',
    entityId: req.params.id,
    newValue: { action: result.action, ...(reason ? { reason } : {}) },
  });

  successResponse(res, result, result.message);
});
