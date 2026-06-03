import { Request, Response } from 'express';
import catchAsync from '#utils/catchAsync';
import AppError from '#utils/appError';
import * as storageService from '#services/storage.service';

/**
 * GET /api/v1/storage/assets/*
 * Public proxy for non-sensitive R2 objects (banners, product images, avatars).
 */
export const servePublicAsset = catchAsync(async (req: Request, res: Response) => {
  const match = req.path.match(/^\/assets\/(.+)$/);
  const filePath = match?.[1] ? decodeURIComponent(match[1]) : '';

  if (!filePath || filePath.includes('..')) {
    throw new AppError('Path tidak valid.', 400);
  }

  if (!storageService.isPublicAssetPath(filePath)) {
    throw new AppError('Akses ditolak.', 403);
  }

  const file = await storageService.getFileStream(filePath);
  if (!file) {
    throw new AppError('File tidak ditemukan.', 404);
  }

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  file.stream.pipe(res);
});

/**
 * GET /api/v1/storage/secure/*
 * Signed URL proxy for sensitive documents.
 *
 * SEC-BE-017: tambah path normalization. Walau signature HMAC sudah melindungi
 * integritas, key dengan `..` / null byte / leading-slash bisa memperluas key space
 * dan menimbulkan ambiguity di sisi R2.
 */
export const serveSecureAsset = catchAsync(async (req: Request, res: Response) => {
  const match = req.path.match(/^\/secure\/(.+)$/);
  const filePath = match?.[1] ? decodeURIComponent(match[1]) : '';
  const { expires, signature } = req.query;

  if (typeof expires !== 'string' || typeof signature !== 'string') {
    throw new AppError('Tanda tangan tidak valid.', 403);
  }

  if (
    !filePath ||
    filePath.includes('..') ||
    filePath.includes('\0') ||
    filePath.startsWith('/') ||
    filePath.startsWith('\\')
  ) {
    throw new AppError('Path tidak valid.', 400);
  }

  const file = await storageService.getSecureFileStream(filePath, expires, signature);
  if (!file) {
    throw new AppError('File tidak ditemukan.', 404);
  }

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  file.stream.pipe(res);
});
