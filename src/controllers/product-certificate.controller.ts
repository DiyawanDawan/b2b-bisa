import { Response } from 'express';
import { ProductCertificateStatus, UserRole } from '#prisma';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { createdResponse, paginatedResponse, successResponse } from '#utils/response.util';
import * as certificateService from '#services/product-certificate.service';

export const submit = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await certificateService.submitCertificate(
    req.params.productId,
    req.user!.id,
    req.user!.role === UserRole.ADMIN,
    req.body,
  );
  createdResponse(res, result, 'Sertifikat dikirim dan menunggu pemeriksaan admin.');
});

export const listMine = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await certificateService.listOwnerCertificates(
    req.params.productId,
    req.user!.id,
    req.user!.role === UserRole.ADMIN,
  );
  successResponse(res, result, 'Daftar sertifikat produk berhasil diambil.');
});

export const removeMine = catchAsync(async (req: AuthRequest, res: Response) => {
  await certificateService.deleteOwnerCertificate(
    req.params.productId,
    req.params.certificateId,
    req.user!.id,
    req.user!.role === UserRole.ADMIN,
  );
  successResponse(res, null, 'Sertifikat berhasil dihapus.');
});

export const listPublicProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await certificateService.listPublicProductCertificates(req.params.productId);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  successResponse(
    res,
    result.map((certificate) => ({
      ...certificate,
      documentUrl: `${baseUrl}/api/v1/products/${req.params.productId}/certificates/${certificate.id}/document`,
    })),
    'Sertifikat terverifikasi berhasil diambil.',
  );
});

export const openPublicDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const url = await certificateService.getPublicCertificateDocument(
    req.params.productId,
    req.params.certificateId,
  );
  res.redirect(url!);
});

export const listPublicSupplier = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const result = await certificateService.listPublicSupplierCertificates(
    req.params.id,
    page,
    limit,
  );
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const rows = result.rows.map((certificate) => ({
    ...certificate,
    documentUrl: `${baseUrl}/api/v1/products/${certificate.productId}/certificates/${certificate.id}/document`,
  }));
  paginatedResponse(res, rows, result.total, page, limit, 'Sertifikat supplier berhasil diambil.');
});

export const listAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const params = req.query as unknown as {
    status?: ProductCertificateStatus;
    search?: string;
    page: number;
    limit: number;
  };
  const result = await certificateService.listAdminQueue(params);
  paginatedResponse(
    res,
    result.rows,
    result.total,
    params.page,
    params.limit,
    'Antrean sertifikat berhasil diambil.',
  );
});

export const adminDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await certificateService.getAdminDetail(req.params.certificateId);
  successResponse(res, result, 'Detail sertifikat berhasil diambil.');
});

export const listAdminByProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await certificateService.listAdminByProduct(req.params.id);
  successResponse(res, result, 'Sertifikat produk berhasil diambil.');
});

export const review = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await certificateService.reviewCertificate(
    req.params.certificateId,
    req.user!.id,
    req.body.status,
    req.body.rejectionReason,
  );
  successResponse(res, result, 'Keputusan sertifikat berhasil disimpan.');
});
