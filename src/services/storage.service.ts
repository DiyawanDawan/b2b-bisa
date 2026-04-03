import r2Client from '#config/storage';
import logger from '#config/logger';
import crypto from 'crypto';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { JWT_SECRET } from '#utils/env.util';
import { withRetry } from '#utils/retry.util';

const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

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

  const baseUrl = process.env.API_URL || 'http://localhost:3000';
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

  if (signature !== expectedSignature) {
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
 * Get public URL for a given relative path (ONLY for non-sensitive files)
 */
export const getPublicUrl = (path: string | null): string | null => {
  if (!path) return null;
  // If it's already a full URL (legacy), return it
  if (path.startsWith('http')) return path;

  return `${PUBLIC_URL}/${path}`;
};

/**
 * Upload a file to R2
 * @param file Buffer or stream of the file
 * @param path Relative path in the bucket (e.g., 'avatars/user123.jpg')
 * @param contentType MIME type of the file
 */
export const uploadFile = async (file: Buffer | any, path: string, contentType: string) => {
  try {
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: path,
        Body: file,
        ContentType: contentType,
      },
    });

    await withRetry(() => upload.done());
    logger.info(`File uploaded successfully to R2: ${path}`);
    return path;
  } catch (error) {
    logger.error('Error uploading to R2:', error);
    throw error;
  }
};

/**
 * Delete a file from R2
 * @param path Relative path in the bucket
 */
export const deleteFile = async (path: string | null) => {
  if (!path) return;
  // If it's a legacy URL, we can't delete it from R2 easily
  if (path.startsWith('http')) return;

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: path,
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
