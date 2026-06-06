import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as verificationService from '#services/verification.service';
import * as adminService from '#services/admin.service';

import * as storageService from '#services/storage.service';
import * as mediaUploadService from '#services/mediaUpload.service';

/**
 * User submits identity documents — multipart (legacy) atau JSON dengan path chunked upload.
 */
export const submitVerification = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const { businessName, taxId, businessAddress, ktpUrl, nibUrl, selfieUrl, siupUrl } =
    req.body as {
      businessName?: string;
      taxId?: string;
      businessAddress?: string;
      ktpUrl?: string;
      nibUrl?: string;
      selfieUrl?: string;
      siupUrl?: string;
    };

  const updateData: Record<string, unknown> = {
    businessName,
    taxId,
    businessAddress,
  };

  const assignPreUploaded = (raw: string | undefined, dbField: string) => {
    if (!raw?.trim()) return;
    mediaUploadService.validatePreUploadedPaths([raw], userId, 'verification');
    const key = storageService.normalizeStorageKey(raw) ?? raw.trim();
    updateData[dbField] = key;
  };

  assignPreUploaded(ktpUrl, 'ktpUrl');
  assignPreUploaded(nibUrl, 'nibUrl');
  assignPreUploaded(selfieUrl, 'selfieUrl');
  assignPreUploaded(siupUrl, 'siupUrl');

  const uploadIfPresent = async (fieldName: string, dbField: string, folder: string) => {
    if (updateData[dbField]) return;
    if (files?.[fieldName]?.[0]) {
      const file = files[fieldName][0];
      const timestamp = Date.now();
      const extension = file.originalname.split('.').pop() || 'jpg';
      const path = `${folder}/${userId}/${fieldName}_${timestamp}.${extension}`;
      updateData[dbField] = await storageService.uploadFile(file.buffer, path, file.mimetype);
    }
  };

  await Promise.all([
    uploadIfPresent('ktp', 'ktpUrl', 'verification'),
    uploadIfPresent('nib', 'nibUrl', 'verification'),
    uploadIfPresent('selfie', 'selfieUrl', 'verification'),
    uploadIfPresent('siup', 'siupUrl', 'verification'),
  ]);

  const result = await verificationService.submitVerification(userId, updateData);
  successResponse(res, result, 'Dokumen identitas berhasil dikirim untuk verifikasi');
});

/**
 * Admin gets list of pending verifications
 */
export const getPendingVerifications = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await verificationService.getPendingVerifications();
  successResponse(res, data, 'Daftar verifikasi tertunda');
});

/**
 * Admin approves or rejects identity verification
 */
export const updateVerificationStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId, status, rejectionReason } = req.body as {
    userId: string;
    status: 'VERIFIED' | 'REJECTED';
    rejectionReason?: string;
  };

  const result = await verificationService.updateVerificationStatus(
    userId,
    status,
    req.user!.id,
    rejectionReason,
  );

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'REVIEW_KYC',
    entity: 'USER_VERIFICATION',
    entityId: userId,
    newValue: { status, rejectionReason, isVerified: status === 'VERIFIED' },
  });

  successResponse(
    res,
    result,
    `Verifikasi identitas berhasil ${status === 'VERIFIED' ? 'disetujui' : 'ditolak'}`,
  );
});
