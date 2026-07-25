import logger from '../../src/config/logger.js';
import { seedReviewsAndDeliveryProofs } from './22-reviews-delivery.seeder.js';

export async function seedOperations(prisma, users) {
  logger.info('🌱 [10] Seeding Complex Operations (Negotiations, Reviews, Logs)...');

  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});

  const { hendra, siti } = users;
  const orders = await prisma.order.findMany({
    select: { id: true },
  });

  if (!orders.length) {
    logger.warn('⚠️ Tidak ada order — jalankan seeder [15] terlebih dahulu.');
  } else {
    // Ulasan + POD + payment proof + dispute evidence
    await seedReviewsAndDeliveryProofs(prisma);
  }

  // Notifications (elite demo users)
  const notifyUsers = [hendra, siti].filter(Boolean);
  for (const user of notifyUsers) {
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: 'Order Terkonfirmasi',
          body: 'Pesanan seed #BISA-SEED-CONF-01 telah dikonfirmasi supplier.',
          type: 'ORDER_STATUS',
          priority: 'HIGH',
        },
        {
          userId: user.id,
          title: 'Pesan Negosiasi Baru',
          body: 'Ada balasan negosiasi pada produk biochar.',
          type: 'SYSTEM_ANNOUNCEMENT',
          priority: 'MEDIUM',
        },
      ],
    });
  }

  // Audit logs — cover admin moderation surfaces used in dashboards
  const admin = users.admin;
  if (admin) {
    const sampleProduct = await prisma.product.findFirst({
      where: { name: { startsWith: '[SEED] Status BLOCKED' } },
      select: { id: true },
    });
    const sampleArticle = await prisma.article.findFirst({
      where: { title: { startsWith: '[SEED]' } },
      select: { id: true },
    });
    const pendingKyc = await prisma.userVerification.findFirst({
      where: { verificationStatus: 'PENDING' },
      select: { id: true, userId: true },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          userId: admin.id,
          action: 'LOGIN',
          entity: 'User',
          entityId: admin.id,
          ipAddress: '192.168.1.1',
        },
        {
          userId: admin.id,
          action: 'UPDATE_FEE',
          entity: 'PlatformFeeSetting',
          entityId: 'global',
          newValue: JSON.stringify({ amount: 3.5 }),
        },
        {
          userId: admin.id,
          action: 'MODERATE_PRODUCT_STATUS',
          entity: 'Product',
          entityId: sampleProduct?.id ?? 'seed-product',
          oldValue: JSON.stringify({ status: 'ACTIVE' }),
          newValue: JSON.stringify({ status: 'BLOCKED', reason: '[SEED] Moderation demo' }),
          ipAddress: '192.168.1.1',
        },
        {
          userId: admin.id,
          action: 'PUBLISH_ARTICLE',
          entity: 'Article',
          entityId: sampleArticle?.id ?? 'seed-article',
          newValue: JSON.stringify({ status: 'PUBLISHED' }),
          ipAddress: '192.168.1.1',
        },
        {
          userId: admin.id,
          action: 'REVIEW_KYC',
          entity: 'UserVerification',
          entityId: pendingKyc?.id ?? 'seed-kyc',
          newValue: JSON.stringify({
            verificationStatus: 'PENDING',
            userId: pendingKyc?.userId ?? null,
          }),
          ipAddress: '192.168.1.1',
        },
        {
          userId: admin.id,
          action: 'FLAG_RFQ',
          entity: 'Rfq',
          entityId: 'seed-rfq',
          newValue: JSON.stringify({ isFlagged: true, reason: '[SEED] audit coverage' }),
          ipAddress: '192.168.1.1',
        },
      ],
    });
  }

  logger.info('✅ [10] Complex Operations (Negotiations, Chat, Reviews, Logs) seeded.');
}
