import { expireStaleBookings } from '#services/booking.service';
import logger from '#config/logger';

const BOOKING_EXPIRY_INTERVAL_MS = 15 * 60 * 1000; // 15 menit

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBookingExpiryCron(): void {
  if (intervalId) {
    logger.warn('[CRON] Booking expiry cron already running, skipping duplicate start.');
    return;
  }

  logger.info(
    `[CRON] Booking expiry scheduler started (interval: ${BOOKING_EXPIRY_INTERVAL_MS / 60000} menit)`,
  );

  void runExpiryCheck();
  intervalId = setInterval(runExpiryCheck, BOOKING_EXPIRY_INTERVAL_MS);
}

async function runExpiryCheck(): Promise<void> {
  try {
    const result = await expireStaleBookings();
    if (result.count > 0) {
      logger.info(`[CRON] ${result.count} booking kedaluwarsa dan reserve dilepas.`);
    }
  } catch (error) {
    logger.error('[CRON] Gagal menjalankan booking expiry check:', error);
  }
}

export function stopBookingExpiryCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[CRON] Booking expiry scheduler stopped.');
  }
}
