import prisma from '#db';
import logger from '../../src/config/logger.js';
import { seedTaxonomies } from './01-taxonomies.seeder.js';
import { seedRegions } from './02b-regions.seeder.js';
import { seedFinancial } from './03-financial.seeder.js';
import { seedUsers } from './04-users.seeder.js';
import { seedVouchers } from './20-vouchers.seeder.js';
import { seedProducts } from './05-products.seeder.js';
import { seedIoT } from './06-iot.seeder.js';
import { seedAnalytics } from './07-analytics.seeder.js';
import { seedTransactions } from './08-transactions.seeder.js';
import { seedCommunity } from './09-community.seeder.js';
import { seedForumGroups } from './09-forum-groups.seeder.js';
import { seedOperations } from './10-operations.seeder.js';
import { seedMarket } from './11-market.seeder.js';
import { seedVerifications } from './12-verifications.seeder.js';
import { seedCollections } from './13-collections.seeder.js';
import { seedPolicies } from './14-policies.seeder.js';
import { seedOrdersAndNegotiations } from './15-orders-negotiations.seeder.js';
import { seedFaqs } from './16-faqs.seeder.js';
import { seedStoreBanners } from './17-store-banners.seeder.js';
import { seedCertificates } from './25-certificates.seeder.js';
import { seedSummary } from './18-seed-summary.seeder.js';
import { seedPickupVehicles } from './19-pickup-vehicles.seeder.js';
import { seedRegionalMarketSales } from './21-regional-market-sales.seeder.js';
import { seedPartnerships } from './23-partnerships.seeder.js';
import { seedBisaExpress } from './24-bisa-express.seeder.js';

async function main() {
  logger.info('🚀 Memulai proses FULL Seeding Database BISA B2B...');

  try {
    // Phase 1: Absolute Dependencies (No foreign keys)
    await seedTaxonomies(prisma);
    await seedRegions(prisma);
    await seedFinancial(prisma);

    // Phase 2: Core Entities (Depends on Taxonomies & Finance)
    const users = await seedUsers(prisma);
    await seedVouchers(prisma, users);
    await seedVerifications(prisma);

    // Phase 3: Business Logic (Depends on Users)
    if (users && users.allSuppliers && users.allSuppliers.length > 0) {
      await seedProducts(prisma, users);
      await seedStoreBanners(prisma, users);
      await seedCertificates(prisma, users);
      await seedIoT(prisma, users);
    } else {
      logger.warn('Seeding Produk, Banner & IoT dilewati karena Supplier tidak ditemukan.');
    }

    // Phase 4: Complex Flows (Depends on Everything)
    await seedAnalytics(prisma);
    await seedTransactions(prisma, users);
    await seedOrdersAndNegotiations(prisma, users);
    await seedRegionalMarketSales(prisma);
    await seedForumGroups(prisma);
    await seedCommunity(prisma, users);
    await seedOperations(prisma, users);
    await seedPartnerships(prisma);
    await seedMarket(prisma);
    await seedCollections(prisma);
    await seedPolicies(prisma);
    await seedFaqs(prisma);
    await seedPickupVehicles(prisma);
    await seedBisaExpress(prisma);
    await seedSummary(prisma);

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
