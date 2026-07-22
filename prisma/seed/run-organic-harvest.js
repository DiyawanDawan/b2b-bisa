import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedOrganicHarvest } from './26-organic-harvest.seeder.js';

async function main() {
  try {
    const users = await prisma.user.findFirst({ where: { email: 'admin@bisaes.com' } });
    const siti = await prisma.user.findFirst({ where: { email: 'siti.aminah@agritech.com' } });
    const green = await prisma.user.findFirst({ where: { email: 'hello@greenearth.co' } });
    await seedOrganicHarvest(prisma, { admin: users, siti, green });
  } catch (error) {
    logger.error('Gagal seed organic harvest:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
