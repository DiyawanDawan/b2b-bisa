import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import * as crm from '#services/admin-crm.service';
import { UserRole } from '#prisma';
import type { CrmStage } from '#services/admin-crm.service';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';

export const getCrmOverview = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminCrmOverview(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    crm.getCrmOverview(),
  );
  return successResponse(res, data, 'Ringkasan CRM berhasil diambil');
});

export const listCrmContacts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search, role, stage } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
    role?: UserRole;
    stage?: CrmStage;
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await crm.listCrmContacts({
    page: pageNum,
    limit: limitNum,
    search,
    role,
    stage,
  });
  return paginatedResponse(res, result.items, result.pagination.total, pageNum, limitNum);
});

export const getCrmContactDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await crm.getCrmContactDetail(req.params.userId);
  return successResponse(res, data, 'Detail kontak CRM berhasil diambil');
});

export const createCrmNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const { content, noteType } = req.body as { content: string; noteType?: string };
  const note = await crm.createCrmNote(req.params.userId, req.user!.id, { content, noteType });
  return successResponse(res, note, 'Catatan CRM berhasil disimpan');
});

export const updateCrmContact = catchAsync(async (req: AuthRequest, res: Response) => {
  const { stage, nextFollowUpAt, priority } = req.body as {
    stage?: CrmStage;
    nextFollowUpAt?: string | null;
    priority?: string;
  };
  const data = await crm.updateCrmContact(req.params.userId, req.user!.id, {
    stage,
    nextFollowUpAt,
    priority,
  });
  return successResponse(res, data, 'Kontak CRM berhasil diperbarui');
});
