import { Request } from 'express';
import { toSecureMediaUrl } from '#utils/env.util';

/**
 * Origin absolut dari request (memakai X-Forwarded-Proto saat trust proxy aktif),
 * di-upgrade ke https untuk host publik supaya URL yang dikirim ke browser tidak
 * diblokir sebagai mixed content saat panel dibuka via https.
 */
export const getRequestBaseUrl = (req: Request): string =>
  toSecureMediaUrl(`${req.protocol}://${req.get('host')}`);
