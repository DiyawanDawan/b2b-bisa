import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MediaUploadSessionStatus,
  Prisma,
} from '#prisma';
import r2Client from '#config/storage';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import * as storageService from '#services/storage.service';
import {
  MEDIA_UPLOAD_PROXY_MODE,
  MEDIA_UPLOAD_SESSION_TTL_HOURS,
} from '#utils/env.util';
import {
  assertAllowedFolder,
  buildR2ObjectKey,
  computeMultipartPlan,
  maxBytesForMime,
  parseCompletedParts,
  type CompletedPartRecord,
  type AllowedMediaFolder,
} from '#utils/mediaUpload.util';

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const PRESIGN_TTL_SECONDS = 3600;

const isSinglePartSession = (session: { totalParts: number; r2UploadId: string | null }) =>
  session.totalParts === 1 && !session.r2UploadId;

const isNoSuchMultipartUpload = (err: unknown): boolean => {
  const code = (err as { Code?: string; name?: string })?.Code ?? (err as { name?: string })?.name;
  const message = String((err as Error)?.message ?? err ?? '');
  return (
    code === 'NoSuchUpload' ||
    message.includes('multipart upload does not exist') ||
    message.includes('specified multipart upload does not exist')
  );
};

const sessionExpiry = (): Date => {
  const d = new Date();
  d.setHours(d.getHours() + MEDIA_UPLOAD_SESSION_TTL_HOURS);
  return d;
};

const loadOwnedSession = async (sessionId: string, userId: string) => {
  const session = await prisma.mediaUploadSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError('Sesi upload tidak ditemukan.', 404);
  if (session.userId !== userId) throw new AppError('Akses ditolak untuk sesi upload ini.', 403);
  if (session.expiresAt < new Date()) {
    await prisma.mediaUploadSession.update({
      where: { id: sessionId },
      data: { status: MediaUploadSessionStatus.EXPIRED },
    });
    throw new AppError('Sesi upload sudah kedaluwarsa.', 410);
  }
  if (session.status === MediaUploadSessionStatus.COMPLETED) {
    throw new AppError('Sesi upload sudah selesai.', 409);
  }
  if (session.status === MediaUploadSessionStatus.ABORTED) {
    throw new AppError('Sesi upload dibatalkan.', 410);
  }
  return session;
};

export const initUpload = async (params: {
  userId: string;
  folder: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
}) => {
  const folder = assertAllowedFolder(params.folder);
  const maxBytes = maxBytesForMime(params.mimeType);
  if (params.totalBytes > maxBytes) {
    throw new AppError(`Ukuran file melebihi batas (${maxBytes} bytes).`, 400);
  }

  const { partSize, totalParts } = computeMultipartPlan(params.totalBytes);
  const r2Key = buildR2ObjectKey(folder, params.userId, params.fileName);

  let r2UploadId: string | null = null;

  // File kecil (1 part) — PutObject langsung, hindari error multipart di R2.
  if (totalParts > 1) {
    const createRes = await r2Client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: r2Key,
        ContentType: params.mimeType,
      }),
    );

    if (!createRes.UploadId) {
      throw new AppError('Gagal memulai multipart upload di R2.', 500);
    }
    r2UploadId = createRes.UploadId;
  }

  const session = await prisma.mediaUploadSession.create({
    data: {
      userId: params.userId,
      folder,
      fileName: params.fileName,
      mimeType: params.mimeType,
      totalBytes: BigInt(params.totalBytes),
      partSize,
      totalParts,
      r2UploadId,
      r2Key,
      status: MediaUploadSessionStatus.INIT,
      completedParts: [],
      expiresAt: sessionExpiry(),
    },
  });

  return {
    sessionId: session.id,
    uploadMode: MEDIA_UPLOAD_PROXY_MODE ? ('proxy' as const) : ('presigned' as const),
    partSize,
    totalParts,
    r2Key,
    expiresAt: session.expiresAt.toISOString(),
  };
};

export const getSessionStatus = async (sessionId: string, userId: string) => {
  const session = await loadOwnedSession(sessionId, userId);
  const completedParts = parseCompletedParts(session.completedParts);
  return {
    sessionId: session.id,
    status: session.status,
    uploadMode: MEDIA_UPLOAD_PROXY_MODE ? 'proxy' : 'presigned',
    partSize: session.partSize,
    totalParts: session.totalParts,
    totalBytes: Number(session.totalBytes),
    mimeType: session.mimeType,
    folder: session.folder,
    fileName: session.fileName,
    completedParts,
    finalPath: session.finalPath,
    expiresAt: session.expiresAt.toISOString(),
  };
};

export const presignPart = async (
  sessionId: string,
  userId: string,
  partNumber: number,
  apiBaseUrl: string,
) => {
  const session = await loadOwnedSession(sessionId, userId);
  if (partNumber < 1 || partNumber > session.totalParts) {
    throw new AppError('Nomor part tidak valid.', 400);
  }

  if (MEDIA_UPLOAD_PROXY_MODE) {
    return {
      partNumber,
      uploadUrl: `${apiBaseUrl}/api/v1/media/uploads/${sessionId}/parts/${partNumber}`,
      method: 'PUT' as const,
      headers: { 'Content-Type': 'application/octet-stream' },
    };
  }

  if (!session.r2UploadId) throw new AppError('Upload R2 belum diinisialisasi.', 500);

  const command = new UploadPartCommand({
    Bucket: BUCKET_NAME,
    Key: session.r2Key,
    UploadId: session.r2UploadId,
    PartNumber: partNumber,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: PRESIGN_TTL_SECONDS });
  return {
    partNumber,
    uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': 'application/octet-stream' },
  };
};

export const uploadPartProxy = async (
  sessionId: string,
  userId: string,
  partNumber: number,
  body: Buffer,
) => {
  const session = await loadOwnedSession(sessionId, userId);
  if (partNumber < 1 || partNumber > session.totalParts) {
    throw new AppError('Nomor part tidak valid.', 400);
  }
  let etag: string;

  if (isSinglePartSession(session)) {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: session.r2Key,
        Body: body,
        ContentType: session.mimeType,
      }),
    );
    etag = 'single';
  } else {
    if (!session.r2UploadId) throw new AppError('Upload R2 belum diinisialisasi.', 500);

    const response = await r2Client.send(
      new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: session.r2Key,
        UploadId: session.r2UploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );

    etag = response.ETag?.replace(/"/g, '') ?? '';
    if (!etag) throw new AppError('ETag part tidak diterima dari R2.', 500);
  }

  const existing = parseCompletedParts(session.completedParts);
  const filtered = existing.filter((p) => p.partNumber !== partNumber);
  const updated: CompletedPartRecord[] = [
    ...filtered,
    { partNumber, etag, size: body.length },
  ].sort((a, b) => a.partNumber - b.partNumber);

  await prisma.mediaUploadSession.update({
    where: { id: sessionId },
    data: {
      status: MediaUploadSessionStatus.UPLOADING,
      completedParts: updated as unknown as Prisma.InputJsonValue,
    },
  });

  return { partNumber, etag, size: body.length };
};

export const completeUpload = async (
  sessionId: string,
  userId: string,
  parts: { partNumber: number; etag: string }[],
) => {
  const session = await loadOwnedSession(sessionId, userId);

  const stored = parseCompletedParts(session.completedParts);
  const merged = new Map<number, string>();

  for (const p of stored) merged.set(p.partNumber, p.etag);
  for (const p of parts) merged.set(p.partNumber, p.etag.replace(/"/g, ''));

  if (merged.size !== session.totalParts) {
    throw new AppError(
      `Part belum lengkap (${merged.size}/${session.totalParts}). Lanjutkan upload atau resume.`,
      400,
    );
  }

  const finalPath = session.r2Key;

  if (isSinglePartSession(session)) {
    if (!merged.has(1)) {
      throw new AppError('File belum diunggah. Kirim chunk terlebih dahulu.', 400);
    }
  } else {
    if (!session.r2UploadId) throw new AppError('Upload R2 belum diinisialisasi.', 500);

    const completedParts = Array.from(merged.entries())
      .map(([partNumber, etag]) => ({ PartNumber: partNumber, ETag: etag }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    try {
      await r2Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: session.r2Key,
          UploadId: session.r2UploadId,
          MultipartUpload: { Parts: completedParts },
        }),
      );
    } catch (err) {
      if (isNoSuchMultipartUpload(err)) {
        await prisma.mediaUploadSession.update({
          where: { id: sessionId },
          data: { status: MediaUploadSessionStatus.ABORTED },
        });
        throw new AppError(
          'Sesi upload kedaluwarsa di penyimpanan. Silakan unggah ulang dokumen.',
          410,
        );
      }
      throw err;
    }
  }
  await prisma.mediaUploadSession.update({
    where: { id: sessionId },
    data: {
      status: MediaUploadSessionStatus.COMPLETED,
      finalPath,
      completedParts: Array.from(merged.entries()).map(([partNumber, etag]) => ({
        partNumber,
        etag,
      })) as unknown as Prisma.InputJsonValue,
    },
  });

  const url = storageService.getPublicUrl(finalPath);
  return { path: finalPath, url };
};

export const abortUpload = async (sessionId: string, userId: string) => {
  const session = await loadOwnedSession(sessionId, userId);
  if (session.status !== MediaUploadSessionStatus.COMPLETED) {
    try {
      if (session.r2UploadId) {
        await r2Client.send(
          new AbortMultipartUploadCommand({
            Bucket: BUCKET_NAME,
            Key: session.r2Key,
            UploadId: session.r2UploadId,
          }),
        );
      } else if (isSinglePartSession(session)) {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: session.r2Key,
          }),
        );
      }
    } catch {
      // best-effort
    }
  }
  await prisma.mediaUploadSession.update({
    where: { id: sessionId },
    data: { status: MediaUploadSessionStatus.ABORTED },
  });
};

/** Validate pre-uploaded paths belong to user (products flow). */
export const validatePreUploadedPaths = (
  paths: string[],
  userId: string,
  folder: AllowedMediaFolder = 'products',
) => {
  for (const raw of paths) {
    const key = storageService.normalizeStorageKey(raw) ?? raw.trim();
    if (storageService.isExternalMediaUrl(key)) {
      throw new AppError('URL eksternal tidak diizinkan untuk imageUrls.', 400);
    }
    const expectedPrefix = `${folder}/${userId}/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new AppError(`Path media tidak valid atau bukan milik Anda: ${key}`, 400);
    }
  }
};

export const expireStaleSessions = async (): Promise<number> => {
  const stale = await prisma.mediaUploadSession.findMany({
    where: {
      expiresAt: { lt: new Date() },
      status: { in: [MediaUploadSessionStatus.INIT, MediaUploadSessionStatus.UPLOADING] },
    },
    take: 50,
  });

  for (const session of stale) {
    if (session.r2UploadId) {
      try {
        await r2Client.send(
          new AbortMultipartUploadCommand({
            Bucket: BUCKET_NAME,
            Key: session.r2Key,
            UploadId: session.r2UploadId,
          }),
        );
      } catch {
        // best-effort
      }
    }
    await prisma.mediaUploadSession.update({
      where: { id: session.id },
      data: { status: MediaUploadSessionStatus.EXPIRED },
    });
  }
  return stale.length;
};
