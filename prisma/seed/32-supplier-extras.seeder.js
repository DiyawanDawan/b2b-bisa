import crypto from 'node:crypto';
import logger from '../../src/config/logger.js';

export async function seedSupplierExtras(prisma, users) {
  logger.info('🌱 [32] Seeding supplier extras (API key, referral, live, knowledge, devices)...');

  await prisma.liveSessionComment.deleteMany({});
  await prisma.liveSession.deleteMany({ where: { title: { startsWith: '[SEED]' } } });
  await prisma.referralReward.deleteMany({});
  await prisma.supplierApiKey.deleteMany({ where: { keyPrefix: 'bisa_seed' } });
  await prisma.knowledgeDocument.deleteMany({ where: { title: { startsWith: '[SEED]' } } });
  await prisma.userDevice.deleteMany({ where: { fcmToken: { startsWith: 'SEED_FCM_' } } });
  await prisma.userSavedPayment.deleteMany({});

  const supplier = users?.siti ?? users?.allSuppliers?.[0];
  const buyer = users?.hendra ?? users?.allBuyers?.[0];
  const admin = users?.admin;

  if (!supplier || !buyer) {
    logger.warn('⚠️ [32] Supplier/buyer tidak ditemukan.');
    return;
  }

  const rawKey = `bisa_seed_demo_${supplier.id.slice(0, 8)}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  await prisma.supplierApiKey.create({
    data: {
      userId: supplier.id,
      name: 'Demo Integration Key',
      keyHash,
      keyPrefix: 'bisa_seed',
      isActive: true,
    },
  });

  const referredBuyers = (users?.allBuyers ?? []).filter((b) => b.id !== buyer.id);
  if (referredBuyers[0]) {
    await prisma.referralReward.create({
      data: {
        referrerId: buyer.id,
        referredUserId: referredBuyers[0].id,
        amount: 100_000,
        status: 'PENDING',
      },
    });
  }
  if (referredBuyers[1]) {
    const completedOrder = await prisma.order.findFirst({
      where: { buyerId: referredBuyers[1].id, status: 'COMPLETED' },
      select: { id: true },
    });
    if (completedOrder) {
      await prisma.referralReward.create({
        data: {
          referrerId: supplier.id,
          referredUserId: referredBuyers[1].id,
          orderId: completedOrder.id,
          amount: 250_000,
          status: 'CREDITED',
          creditedAt: new Date(),
        },
      });
    }
  }

  const organicProduct = await prisma.product.findFirst({
    where: { userId: supplier.id, productMode: 'ORGANIC_PRODUCE' },
    select: { id: true },
  });

  const live = await prisma.liveSession.create({
    data: {
      supplierId: supplier.id,
      title: '[SEED] Live Panen Organik Demo',
      description: 'Sesi live demo hasil tani & jadwal panen.',
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() + 3 * 86400000),
      pinnedProductIds: organicProduct ? [organicProduct.id] : [],
      viewerCount: 42,
    },
  });

  const commentAuthors = [buyer, supplier].filter(Boolean);
  for (let i = 0; i < 3; i++) {
    await prisma.liveSessionComment.create({
      data: {
        sessionId: live.id,
        userId: commentAuthors[i % commentAuthors.length].id,
        message: ['Kapan panen berikutnya?', 'Bisa booking 2 ton?', 'Kualitas organik terjaga?'][i],
      },
    });
  }

  if (admin) {
    await prisma.knowledgeDocument.createMany({
      data: [
        {
          title: '[SEED] Panduan Booking Pre-Harvest',
          description: 'Cara booking stok hasil tani sebelum panen.',
          sourceType: 'TEXT',
          status: 'INDEXED',
          chunkCount: 3,
          uploadedById: admin.id,
        },
        {
          title: '[SEED] Ketahanan Produk Organik',
          description: 'Referensi ketahanan dan estimasi pengiriman.',
          sourceType: 'TEXT',
          status: 'INDEXED',
          chunkCount: 2,
          uploadedById: admin.id,
        },
      ],
    });
  }

  await prisma.userDevice.createMany({
    data: [
      {
        userId: buyer.id,
        fcmToken: 'SEED_FCM_BUYER_ANDROID',
        platform: 'ANDROID',
      },
      {
        userId: supplier.id,
        fcmToken: 'SEED_FCM_SUPPLIER_IOS',
        platform: 'IOS',
      },
    ],
  });

  await prisma.userSavedPayment.create({
    data: {
      userId: buyer.id,
      channelCode: 'BCA',
      channelName: 'BCA Virtual Account',
      channelGroup: 'BANK_TRANSFER',
      isDefault: true,
    },
  });

  logger.info('✅ [32] Supplier extras seeded.');
}
