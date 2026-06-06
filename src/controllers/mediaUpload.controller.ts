import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import * as mediaUploadService from '#services/mediaUpload.service';
import { getMediaBaseUrl } from '#utils/env.util';

export const initUpload = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await mediaUploadService.initUpload({
    userId: req.user!.id,
    ...req.body,
  });
  return createdResponse(res, result, 'Sesi upload media berhasil dibuat.');
});

export const getSession = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await mediaUploadService.getSessionStatus(req.params.id, req.user!.id);
  return successResponse(res, result, 'Status sesi upload.');
});

export const presignPart = catchAsync(async (req: AuthRequest, res: Response) => {
  const apiBase = getMediaBaseUrl();
  const result = await mediaUploadService.presignPart(
    req.params.id,
    req.user!.id,
    Number(req.params.partNumber),
    apiBase,
  );
  return successResponse(res, result, 'URL upload part.');
});

export const uploadPartProxy = catchAsync(async (req: AuthRequest, res: Response) => {
  const body = req.body as Buffer;
  if (!body?.length) {
    return res.status(400).json({ meta: { success: false, message: 'Body chunk kosong.' }, data: null });
  }
  const result = await mediaUploadService.uploadPartProxy(
    req.params.id,
    req.user!.id,
    Number(req.params.partNumber),
    body,
  );
  return successResponse(res, result, 'Chunk berhasil diunggah.');
});

export const completeUpload = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await mediaUploadService.completeUpload(
    req.params.id,
    req.user!.id,
    req.body.parts,
  );
  return successResponse(res, result, 'File media berhasil digabung.');
});

export const abortUpload = catchAsync(async (req: AuthRequest, res: Response) => {
  await mediaUploadService.abortUpload(req.params.id, req.user!.id);
  return successResponse(res, null, 'Sesi upload dibatalkan.');
});
