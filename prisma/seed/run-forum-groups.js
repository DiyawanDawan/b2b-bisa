import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedForumGroups } from './09-forum-groups.seeder.js';
import { seedForumGroupPosts } from './09-forum-group-posts.seeder.js';

/**
 * Seed khusus testing forum grup:
 * 1) Hapus & buat ulang ForumGroup + members
 * 2) Seed postingan per grup + komentar + reply
 *
 * Jalankan:
 *   npm run seed:forum-groups
 */
async function main() {
  try {
    logger.info('🚀 Seed ulang forum groups + postingan + komentar...');
    await seedForumGroups(prisma);
    await seedForumGroupPosts(prisma);
    logger.info('✅ Seed forum groups selesai.');
  } catch (error) {
    logger.error('Gagal seed forum groups/content:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
