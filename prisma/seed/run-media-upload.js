import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedMediaUploadSessions } from './33-media-upload.seeder.js';

async function main() {
  try {
    const siti = await prisma.user.findFirst({ where: { email: 'siti.aminah@agritech.com' } });
    const hendra = await prisma.user.findFirst({
      where: { email: 'h.wijaya@surabayaindustrial.com' },
    });
    const allSuppliers = await prisma.user.findMany({ where: { role: 'SUPPLIER' } });
    const allBuyers = await prisma.user.findMany({ where: { role: 'BUYER' } });
    await seedMediaUploadSessions(prisma, { siti, hendra, allSuppliers, allBuyers });
  } catch (error) {
    logger.error('Gagal seed media upload:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
