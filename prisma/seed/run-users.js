import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedUsers } from './04-users.seeder.js';

async function main() {
  logger.info('🎯 Menjalankan seed Users saja...');
  try {
    const result = await seedUsers(prisma);
    logger.info('✅ Seed users selesai.');
    console.log('Returned:', Object.keys(result));
  } catch (error) {
    logger.error('❌ Gagal seed users:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
