import r2Client from '#config/storage';
import AppError from '#utils/appError';
import logger from '#config/logger';
import crypto from 'crypto';
import { GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { JWT_SECRET, getMediaBaseUrl, buildStorageAssetUrl } from '#utils/env.util';
import { isLoremFlickrDbPath, loremFlickrDbPathToUrl } from '#utils/loremFlickrMedia.util';
import { withRetry } from '#utils/retry.util';

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

/** Prefixes that may be served without signed URL (marketing / product media). */
const PUBLIC_ASSET_PREFIXES = [
  'store-banners/',
  'avatars/',
  'products/',
  'general/',
  'forum/',
  'negotiations/',
  'articles/',
  'categories/',
];

const isPrivateR2Endpoint = (url: string) => url.includes('r2.cloudflarestorage.com');

export const isPublicAssetPath = (path: string): boolean => {
  const normalized = path.replace(/^\//, '');
  return PUBLIC_ASSET_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

/**
 * Normalize DB value to R2 object key or keep external http URL (picsum, CDN).
 * Fixes legacy rows that stored full r2.cloudflarestorage.com URLs.
 */
export const normalizeStorageKey = (value: string | null | undefined): string | null => {
  if (!value?.trim()) return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith('http')) {
    return trimmed.replace(/^\//, '');
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes('r2.cloudflarestorage.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      // Path-style: /bucket/key/... or /key/...
      if (parts[0] === BUCKET_NAME && parts.length > 1) {
        return parts.slice(1).join('/');
      }
      return parts.join('/');
    }

    // Proxy URL stored by mistake — extract key after /storage/assets/
    const assetsIdx = url.pathname.indexOf('/storage/assets/');
    if (assetsIdx !== -1) {
      return decodeURIComponent(url.pathname.slice(assetsIdx + '/storage/assets/'.length));
    }
  } catch {
    return trimmed;
  }

  return trimmed;
};

export const isExternalMediaUrl = (value: string): boolean =>
  value.startsWith('http') && !value.includes('r2.cloudflarestorage.com');

/**
 * Generate a short-lived signed URL for internal proxying
 * @param path Relative path in the bucket
 * @param expiresIn Time until the link expires (seconds)
 */
export const getSignedProxyUrl = (path: string | null, expiresIn = 3600): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${path}:${expires}`)
    .digest('hex');

  const baseUrl = getMediaBaseUrl();
  return `${baseUrl}/api/v1/storage/secure/${path}?expires=${expires}&signature=${signature}`;
};

/**
 * Verify a signed proxy URL and return file stream
 */
export const getSecureFileStream = async (
  path: string,
  expiresStr: string,
  signature: string,
): Promise<{ stream: Readable; contentType: string } | null> => {
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || expires < Math.floor(Date.now() / 1000)) {
    throw new Error('Link sudah kadaluwarsa');
  }

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${path}:${expires}`)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error('Tanda tangan tidak valid');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: path,
    });

    const response = await withRetry(() => r2Client.send(command));
    if (!response.Body) return null;

    return {
      stream: response.Body as Readable,
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error) {
    logger.error('Error fetching file from R2:', error);
    return null;
  }
};

/**
 * Stream a file from R2 (used by public/signed proxy routes).
 */
export const getFileStream = async (
  path: string,
): Promise<{ stream: Readable; contentType: string } | null> => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: path.replace(/^\//, ''),
    });

    const response = await r2Client.send(command);
    if (!response.Body) return null;

    return {
      stream: response.Body as Readable,
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error) {
    logger.error('Error fetching file from R2:', error);
    return null;
  }
};

/**
 * Get public URL for a given relative path (ONLY for non-sensitive files)
 */
export const getPublicUrl = (path: string | null): string | null => {
  const normalized = normalizeStorageKey(path);
  if (!normalized) return null;

  if (isLoremFlickrDbPath(normalized)) {
    return loremFlickrDbPathToUrl(normalized);
  }

  // External CDN (picsum, legacy full URLs that aren't our R2 API)
  if (isExternalMediaUrl(normalized)) {
    return normalized;
  }

  const normalizedPath = normalized.replace(/^\//, '');

  if (PUBLIC_URL && !isPrivateR2Endpoint(PUBLIC_URL)) {
    const base = PUBLIC_URL.replace(/\/$/, '');
    const bucketSuffix = `/${BUCKET_NAME}`;
    const publicBase = base.endsWith(bucketSuffix) ? base.slice(0, -bucketSuffix.length) : base;
    return `${publicBase}/${normalizedPath}`;
  }

  return buildStorageAssetUrl(normalizedPath);
};

/**
 * Upload a file to R2
 * @param file Buffer or stream of the file
 * @param path Relative path in the bucket (e.g., 'avatars/user123.jpg')
 * @param contentType MIME type of the file
 */
export const uploadFile = async (file: Buffer | any, path: string, contentType: string) => {
  try {
    await withRetry(async () => {
      const upload = new Upload({
        client: r2Client,
        params: {
          Bucket: BUCKET_NAME,
          Key: path,
          Body: file,
          ContentType: contentType,
        },
      });
      return upload.done();
    });
    logger.info(`File uploaded successfully to R2: ${path}`);
    return path;
  } catch (error: unknown) {
    logger.error('Error uploading to R2:', error);
    throw new AppError('Gagal mengunggah file ke penyimpanan cloud.', 500);
  }
};

export const copyFile = async (sourceKey: string, destKey: string): Promise<string> => {
  const source = normalizeStorageKey(sourceKey);
  if (!source) throw new AppError('File sumber tidak valid.', 400);

  const destination = destKey.replace(/^\//, '');

  try {
    await withRetry(() =>
      r2Client.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${source}`,
          Key: destination,
        }),
      ),
    );
    logger.info(`File copied in R2: ${source} -> ${destination}`);
    return destination;
  } catch (error: unknown) {
    logger.error('Error copying file in R2:', error);
    throw new AppError('Gagal menyalin file media produk.', 500);
  }
};

/**
 * Delete a file from R2
 * @param path Relative path in the bucket
 */
export const deleteFile = async (path: string | null) => {
  const key = normalizeStorageKey(path);
  if (!key || isExternalMediaUrl(key)) return;

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await withRetry(() => r2Client.send(command));
    logger.info(`File deleted successfully from R2: ${path}`);
  } catch (error) {
    logger.error('Error deleting from R2:', error);
    // Silent fail if file doesn't exist
  }
};

/**
 * Update a file in R2 (upload new and delete old)
 * @param file New file buffer/stream
 * @param newPath New relative path
 * @param oldPath Old relative path to delete
 * @param contentType MIME type
 */
export const updateFile = async (
  file: Buffer | any,
  newPath: string,
  oldPath: string | null,
  contentType: string,
) => {
  // Upload new file first
  const path = await uploadFile(file, newPath, contentType);

  // If upload succeeded and there was an old file, delete it
  if (oldPath) {
    await deleteFile(oldPath);
  }

  return path;
};
