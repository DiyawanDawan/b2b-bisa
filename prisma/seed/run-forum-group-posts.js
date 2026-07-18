import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedForumGroupPosts } from './09-forum-group-posts.seeder.js';

/**
 * Hanya seed ulang postingan + komentar grup (grup harus sudah ada).
 *
 *   npm run seed:forum-group-posts
 */
async function main() {
  try {
    await seedForumGroupPosts(prisma);
  } catch (error) {
    logger.error('Gagal seed forum group posts:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
