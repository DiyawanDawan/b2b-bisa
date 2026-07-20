import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import * as partnershipService from '#services/partnership.service';
import { PartnershipStatus, UserRole } from '#prisma';

/**
 * GET /api/v1/admin/partnerships
 */
export const listPartnerships = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as PartnershipStatus | undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const filter =
    (req.query.filter as 'all' | 'needs_action' | 'needs_platform_sign' | 'draft_pending') ||
    'needs_action';

  const result = await partnershipService.listAdminPartnerships({
    page,
    limit,
    status,
    search,
    filter: status ? 'all' : filter,
  });

  return paginatedResponse(
    res,
    result.partnerships,
    result.total,
    result.page,
    result.limit,
    'Daftar kontrak kerjasama.',
  );
});

/**
 * GET /api/v1/admin/partnerships/:id
 */
export const getPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.getPartnershipById(
    req.params.id,
    req.user!.id,
    UserRole.ADMIN,
  );
  return successResponse(res, result, 'Detail kontrak kerjasama.');
});

/**
 * POST /api/v1/admin/partnerships/:id/sign
 */
export const signAsPlatform = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.signPartnership(
    req.params.id,
    req.user!.id,
    UserRole.ADMIN,
    req.body as { signerName?: string; signerTitle?: string },
  );
  return successResponse(res, result, 'Tanda tangan penengah BISA berhasil.');
});
