import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedForumGroups } from './09-forum-groups.seeder.js';

async function main() {
  try {
    await seedForumGroups(prisma);
  } catch (error) {
    logger.error('Gagal seed forum groups:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
