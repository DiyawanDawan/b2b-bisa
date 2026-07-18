import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedReviewsAndDeliveryProofs } from './22-reviews-delivery.seeder.js';

/**
 * Seed ulasan (rating + foto) + bukti pengiriman / POD + payment proof + evidence dispute.
 *
 *   npm run seed:reviews
 */
async function main() {
  try {
    await seedReviewsAndDeliveryProofs(prisma);
  } catch (error) {
    logger.error('Gagal seed reviews/delivery proofs:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
