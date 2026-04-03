import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as verificationService from '#services/verification.service';
import * as adminService from '#services/admin.service';

import * as storageService from '#services/storage.service';

/**
 * User submits their identity documents (multipart/form-data)
 */
export const submitVerification = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  // Ekstraksi field eksplisit agar aman dari injeksi mass-assignment
  const { businessName, taxId, businessAddress } = req.body as {
    businessName?: string;
    taxId?: string;
    businessAddress?: string;
  };

  const updateData: Record<string, unknown> = {
    businessName,
    taxId,
    businessAddress,
  };

  // Helper to upload if file exists
  const uploadIfPresent = async (fieldName: string, dbField: string, folder: string) => {
    if (files && files[fieldName] && files[fieldName][0]) {
      const file = files[fieldName][0];
      const timestamp = Date.now();
      const extension = file.originalname.split('.').pop() || 'jpg';
      const path = `${folder}/${userId}/${fieldName}_${timestamp}.${extension}`;
      updateData[dbField] = await storageService.uploadFile(file.buffer, path, file.mimetype);
    }
  };

  // Upload each file to R2
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
    newValue: { status, rejectionReason },
  });

  successResponse(
    res,
    result,
    `Verifikasi identitas berhasil ${status === 'VERIFIED' ? 'disetujui' : 'ditolak'}`,
  );
});
