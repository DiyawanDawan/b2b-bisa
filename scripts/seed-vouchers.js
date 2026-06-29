#!/usr/bin/env node
/**
 * Seed voucher demo saja (FB-24) — tanpa full database seed.
 *
 * Usage:
 *   node scripts/seed-vouchers.js
 *   npm run seed:vouchers
 */
import dotenv from 'dotenv';
import prisma from '#db';
import logger from '../src/config/logger.js';
import { seedVouchers } from '../prisma/seed/20-vouchers.seeder.js';

dotenv.config();

async function main() {
  const siti = await prisma.user.findFirst({
    where: { role: 'SUPPLIER' },
    select: { id: true, fullName: true },
  });
  const users = { siti, allSuppliers: siti ? [siti] : [] };
  await seedVouchers(prisma, users);
}

main()
  .catch((e) => {
    logger.error('seed-vouchers gagal:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
