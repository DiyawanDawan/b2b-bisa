import { z } from 'zod';
import { ALLOWED_MEDIA_FOLDERS, ALLOWED_MEDIA_MIME_TYPES } from '#utils/mediaUpload.util';

export const initMediaUploadSchema = z.object({
  folder: z.enum(ALLOWED_MEDIA_FOLDERS as unknown as [string, ...string[]]),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MEDIA_MIME_TYPES as unknown as [string, ...string[]]),
  totalBytes: z.coerce.number().int().positive(),
});

export const completeMediaUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.coerce.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .min(1),
});

export const mediaUploadIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const mediaUploadPartParamSchema = z.object({
  id: z.string().uuid(),
  partNumber: z.coerce.number().int().min(1),
});
