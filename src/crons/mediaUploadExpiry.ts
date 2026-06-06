import { expireStaleSessions } from '#services/mediaUpload.service';
import logger from '#config/logger';

const MEDIA_UPLOAD_EXPIRY_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startMediaUploadExpiryCron(): void {
  if (intervalId) {
    logger.warn('[CRON] Media upload expiry cron already running, skipping duplicate start.');
    return;
  }

  logger.info(
    `[CRON] Media upload session expiry scheduler started (interval: ${MEDIA_UPLOAD_EXPIRY_INTERVAL_MS / 60000} menit)`,
  );

  runExpiryCheck();
  intervalId = setInterval(runExpiryCheck, MEDIA_UPLOAD_EXPIRY_INTERVAL_MS);
}

async function runExpiryCheck(): Promise<void> {
  try {
    const count = await expireStaleSessions();
    if (count > 0) {
      logger.info(`[CRON] ${count} sesi upload media kedaluwarsa dibersihkan.`);
    }
  } catch (error) {
    logger.error('[CRON] Gagal menjalankan media upload expiry check:', error);
  }
}

export function stopMediaUploadExpiryCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[CRON] Media upload session expiry scheduler stopped.');
  }
}
