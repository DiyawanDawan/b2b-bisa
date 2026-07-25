import prisma from '#db';
import logger from '#config/logger';
import { AUDIT_RETENTION_DAYS } from '#utils/env.util';

/** Daily soft retention: delete AuditLog rows older than AUDIT_RETENTION_DAYS. */
const AUDIT_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startAuditRetentionCron(): void {
  if (AUDIT_RETENTION_DAYS <= 0) {
    logger.info('[CRON] Audit retention disabled (AUDIT_RETENTION_DAYS<=0).');
    return;
  }

  if (intervalId) {
    logger.warn('[CRON] Audit retention cron already running, skipping duplicate start.');
    return;
  }

  logger.info(`[CRON] Audit retention started (keep ${AUDIT_RETENTION_DAYS} days, interval: 24h)`);

  void runRetentionPurge();
  intervalId = setInterval(runRetentionPurge, AUDIT_RETENTION_INTERVAL_MS);
}

async function runRetentionPurge(): Promise<void> {
  if (AUDIT_RETENTION_DAYS <= 0) return;

  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      logger.info(
        `[CRON] Purged ${result.count} audit log(s) older than ${AUDIT_RETENTION_DAYS} days (before ${cutoff.toISOString()}).`,
      );
    }
  } catch (error) {
    logger.error('[CRON] Gagal menjalankan audit retention purge:', error);
  }
}

export function stopAuditRetentionCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[CRON] Audit retention scheduler stopped.');
  }
}
