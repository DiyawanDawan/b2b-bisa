import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedPartnerships } from './23-partnerships.seeder.js';

/**
 * Seed surat kontrak kerjasama:
 * PENDING (menunggu approve), ACTIVE (sudah approve + e-sign),
 * AWAITING_SIGNATURE, REJECTED, RENEWAL, EXPIRED, TERMINATED.
 *
 *   npm run seed:partnerships
 *
 * Bukti kontrak publik:
 *   GET /api/v1/partnerships/verify/MITRA-SEED-ACTIVE-001
 */
async function main() {
  try {
    await seedPartnerships(prisma);
  } catch (error) {
    logger.error('Gagal seed partnerships:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
