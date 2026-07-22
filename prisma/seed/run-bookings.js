import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedBookings } from './27-bookings.seeder.js';

async function main() {
  try {
    const hendra = await prisma.user.findFirst({
      where: { email: 'h.wijaya@surabayaindustrial.com' },
    });
    const siti = await prisma.user.findFirst({ where: { email: 'siti.aminah@agritech.com' } });
    const green = await prisma.user.findFirst({ where: { email: 'hello@greenearth.co' } });
    const allSuppliers = await prisma.user.findMany({ where: { role: 'SUPPLIER' } });
    const allBuyers = await prisma.user.findMany({ where: { role: 'BUYER' } });
    await seedBookings(prisma, { hendra, siti, green, allSuppliers, allBuyers });
  } catch (error) {
    logger.error('Gagal seed bookings:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
