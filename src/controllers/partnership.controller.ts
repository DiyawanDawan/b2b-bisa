import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, successResponse } from '#utils/response.util';
import * as partnershipService from '#services/partnership.service';
import { PartnershipStatus, UserRole } from '#prisma';

export const createPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.createPartnership(req.user!.id, req.body);
  createdResponse(res, result, 'Proposal kontrak kerjasama berhasil diajukan.');
});

export const listMyPartnerships = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as PartnershipStatus | undefined;
  const result = await partnershipService.listMyPartnerships(
    req.user!.id,
    req.user!.role as UserRole,
    page,
    limit,
    status,
  );
  successResponse(res, result, 'Daftar mitra kerjasama.');
});

export const getPartnershipById = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.getPartnershipById(req.params.id, req.user!.id);
  successResponse(res, result, 'Detail kontrak kerjasama.');
});

export const checkWithSupplier = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.checkPartnershipWithSupplier(
    req.user!.id,
    req.params.supplierId,
  );
  successResponse(res, result, 'Status kerjasama dengan supplier.');
});

export const acceptPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.acceptPartnership(req.params.id, req.user!.id);
  successResponse(res, result, 'Proposal kerjasama diterima.');
});

export const rejectPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason: string };
  const result = await partnershipService.rejectPartnership(req.params.id, req.user!.id, reason);
  successResponse(res, result, 'Proposal kerjasama ditolak.');
});

export const signPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.signPartnership(req.params.id, req.user!.id);
  successResponse(res, result, 'Kontrak berhasil ditandatangani.');
});

export const terminatePartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason?: string };
  const result = await partnershipService.terminatePartnership(req.params.id, req.user!.id, reason);
  successResponse(res, result, 'Kerjasama berhasil diakhiri.');
});

export const requestRenewal = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.requestRenewal(req.params.id, req.user!.id, req.body);
  successResponse(res, result, 'Pengajuan perpanjangan kontrak berhasil dikirim.');
});

export const acceptRenewal = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.acceptRenewal(req.params.id, req.user!.id);
  successResponse(res, result, 'Perpanjangan kontrak disetujui.');
});

export const rejectRenewal = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason?: string };
  const result = await partnershipService.rejectRenewal(req.params.id, req.user!.id, reason);
  successResponse(res, result, 'Pengajuan perpanjangan ditolak.');
});

export const verifyContract = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partnershipService.getPublicContractVerification(req.params.contractNumber);
  successResponse(res, result, 'Verifikasi kontrak kerjasama.');
});
