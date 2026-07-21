import { Response } from 'express';
import { ProductCertificateStatus, UserRole } from '#prisma';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, paginatedResponse, successResponse } from '#utils/response.util';
import * as storeCertificateService from '#services/supplier-store-certificate.service';

export const submitMine = catchAsync(async (req: AuthRequest, res: Response) => {
  const supplierId = req.user!.id;
  const result = await storeCertificateService.submitStoreCertificate(
    supplierId,
    req.user!.id,
    req.user!.role === UserRole.ADMIN,
    req.body,
  );
  createdResponse(res, result, 'Sertifikat toko dikirim dan menunggu pemeriksaan admin.');
});

export const listMine = catchAsync(async (req: AuthRequest, res: Response) => {
  const supplierId = req.user!.id;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const result = await storeCertificateService.listOwnerStoreCertificates(
    supplierId,
    req.user!.id,
    req.user!.role === UserRole.ADMIN,
    baseUrl,
  );
  successResponse(res, result, 'Daftar sertifikat toko berhasil diambil.');
});

export const removeMine = catchAsync(async (req: AuthRequest, res: Response) => {
  await storeCertificateService.deleteOwnerStoreCertificate(
    req.user!.id,
    req.params.certificateId,
    req.user!.id,
    req.user!.role === UserRole.ADMIN,
  );
  successResponse(res, null, 'Sertifikat toko berhasil dihapus.');
});

export const listPublic = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await storeCertificateService.listPublicStoreCertificates(req.params.id);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  successResponse(
    res,
    result.map((certificate: (typeof result)[number]) => ({
      ...certificate,
      documentUrl: `${baseUrl}/api/v1/suppliers/${req.params.id}/store-certificates/${certificate.id}/document`,
    })),
    'Sertifikat toko terverifikasi berhasil diambil.',
  );
});

export const openPublicDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const url = await storeCertificateService.getPublicStoreCertificateDocument(
    req.params.id,
    req.params.certificateId,
  );
  res.redirect(url!);
});

export const listAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const params = req.query as unknown as {
    status?: ProductCertificateStatus;
    search?: string;
    page: number;
    limit: number;
  };
  const result = await storeCertificateService.listAdminStoreQueue(params);
  paginatedResponse(
    res,
    result.rows,
    result.total,
    params.page,
    params.limit,
    'Antrean sertifikat toko berhasil diambil.',
  );
});

export const adminDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await storeCertificateService.getAdminStoreDetail(req.params.certificateId);
  successResponse(res, result, 'Detail sertifikat toko berhasil diambil.');
});

export const review = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await storeCertificateService.reviewStoreCertificate(
    req.params.certificateId,
    req.user!.id,
    req.body.status,
    req.body.rejectionReason,
  );
  successResponse(res, result, 'Keputusan sertifikat toko berhasil disimpan.');
});
