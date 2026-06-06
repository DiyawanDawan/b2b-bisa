import AppError from '#utils/appError';
import {
  MEDIA_CHUNK_SIZE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_PDF_BYTES,
} from '#utils/env.util';

export const ALLOWED_MEDIA_FOLDERS = [
  'general',
  'products',
  'avatars',
  'negotiations',
  'forum',
  'chat',
  'verification',
  'disputes',
] as const;

export type AllowedMediaFolder = (typeof ALLOWED_MEDIA_FOLDERS)[number];

export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export const isAllowedMediaFolder = (value: string): value is AllowedMediaFolder =>
  (ALLOWED_MEDIA_FOLDERS as readonly string[]).includes(value);

export const assertAllowedFolder = (folder: string): AllowedMediaFolder => {
  if (!isAllowedMediaFolder(folder)) {
    throw new AppError(
      `Folder tidak diizinkan. Pilih: ${ALLOWED_MEDIA_FOLDERS.join(', ')}.`,
      400,
    );
  }
  return folder;
};

export const maxBytesForMime = (mimeType: string): number => {
  if (mimeType === 'application/pdf') return MEDIA_MAX_PDF_BYTES;
  return MEDIA_MAX_IMAGE_BYTES;
};

export const computeMultipartPlan = (totalBytes: number): { partSize: number; totalParts: number } => {
  if (totalBytes <= 0) {
    throw new AppError('Ukuran file tidak valid.', 400);
  }
  if (totalBytes <= MEDIA_CHUNK_SIZE_BYTES) {
    return { partSize: totalBytes, totalParts: 1 };
  }
  const partSize = MEDIA_CHUNK_SIZE_BYTES;
  const totalParts = Math.ceil(totalBytes / partSize);
  return { partSize, totalParts };
};

export const sanitizeUploadFileName = (fileName: string): string => {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  return base.length > 0 ? base : 'upload.bin';
};

export const buildR2ObjectKey = (
  folder: AllowedMediaFolder,
  userId: string,
  fileName: string,
): string => {
  const safe = sanitizeUploadFileName(fileName);
  const ext = safe.includes('.') ? safe.split('.').pop() : 'bin';
  return `${folder}/${userId}/${Date.now()}-${cryptoRandom()}.${ext}`;
};

const cryptoRandom = (): string => Math.random().toString(36).slice(2, 10);

export type CompletedPartRecord = {
  partNumber: number;
  etag: string;
  size: number;
};

export const parseCompletedParts = (value: unknown): CompletedPartRecord[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p) => p && typeof p === 'object')
    .map((p) => p as CompletedPartRecord)
    .filter((p) => typeof p.partNumber === 'number' && typeof p.etag === 'string');
};
