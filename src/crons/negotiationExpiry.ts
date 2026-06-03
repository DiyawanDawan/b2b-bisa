import { expireNegotiations } from '#services/negotiation.service';
import logger from '#config/logger';

/**
 * BUG-H003 FIX: Negotiation Auto-Expiry Scheduler
 *
 * Menjalankan expiry check setiap jam untuk menandai negosiasi
 * yang sudah >48 jam tidak ada respons menjadi EXPIRED.
 * Ini membebaskan buyer untuk membuat penawaran baru.
 */

const NEGOTIATION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startNegotiationExpiryCron(): void {
  if (intervalId) {
    logger.warn('[CRON] Negotiation expiry cron already running, skipping duplicate start.');
    return;
  }

  logger.info(
    `[CRON] Negotiation expiry scheduler started (interval: ${NEGOTIATION_EXPIRY_INTERVAL_MS / 60000} menit)`,
  );

  // Run immediately on startup once
  runExpiryCheck();

  // Then schedule recurring
  intervalId = setInterval(runExpiryCheck, NEGOTIATION_EXPIRY_INTERVAL_MS);
}

async function runExpiryCheck(): Promise<void> {
  try {
    const result = await expireNegotiations();
    if (result.count > 0) {
      logger.info(`[CRON] ${result.count} negosiasi kedaluwarsa berhasil ditandai EXPIRED.`);
    }
  } catch (error) {
    logger.error('[CRON] Gagal menjalankan negotiation expiry check:', error);
  }
}

export function stopNegotiationExpiryCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[CRON] Negotiation expiry scheduler stopped.');
  }
}
