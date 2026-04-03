import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedTaxonomies } from './01-taxonomies.seeder.js';
import { seedCMS } from './02-cms.seeder.js';
import { seedRegions } from './02b-regions.seeder.js';
import { seedFinancial } from './03-financial.seeder.js';
import { seedUsers } from './04-users.seeder.js';
import { seedProducts } from './05-products.seeder.js';
import { seedIoT } from './06-iot.seeder.js';
import { seedAnalytics } from './07-analytics.seeder.js';
import { seedTransactions } from './08-transactions.seeder.js';
import { seedCommunity } from './09-community.seeder.js';
import { seedOperations } from './10-operations.seeder.js';
import { seedMarket } from './11-market.seeder.js';

async function main() {
  logger.info('🚀 Memulai proses FULL Seeding Database BISA B2B...');

  try {
    // Phase 1: Absolute Dependencies (No foreign keys)
    await seedTaxonomies(prisma);
    await seedCMS(prisma);
    await seedRegions(prisma);
    await seedFinancial(prisma);

    // Phase 2: Core Entities (Depends on Taxonomies & Finance)
    const users = await seedUsers(prisma);

    // Phase 3: Business Logic (Depends on Users)
    if (users && users.allSuppliers && users.allSuppliers.length > 0) {
      await seedProducts(prisma, users);
      await seedIoT(prisma, users);
    } else {
      logger.warn('Seeding Produk & IoT dilewati karena Supplier tidak ditemukan.');
    }

    // Phase 4: Complex Flows (Depends on Everything)
    await seedAnalytics(prisma);
    await seedTransactions(prisma, users);
    await seedCommunity(prisma, users);
    await seedOperations(prisma, users);
    await seedMarket(prisma);

    logger.info('SELURUH MODUL SEEDER BERHASIL DIJALANKAN (100% COMPLETE) 🎉');
  } catch (error) {
    logger.error(' Gagal menjalankan Seeding:', error);
  } finally {
    logger.info('Menutup koneksi database...');
    await prisma.$disconnect();
    // process.exit(0);
  }
}

main();
