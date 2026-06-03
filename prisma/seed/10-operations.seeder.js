import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';
import { loremFlickrDbPath } from '../../src/utils/loremFlickrMedia.util.ts';

export async function seedOperations(prisma, users) {
  logger.info('🌱 [10] Seeding Complex Operations (Negotiations, Reviews, Logs)...');

  await prisma.review.deleteMany({});
  await prisma.shipmentTracking.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});

  const { hendra, siti } = users;
  const orders = await prisma.order.findMany({
    include: { buyer: { select: { fullName: true } }, seller: { select: { fullName: true } } },
  });

  if (!orders.length) {
    logger.warn('⚠️ Tidak ada order — jalankan seeder [15] terlebih dahulu.');
    return;
  }

  // 1. Shipment tracking untuk semua order seed
  for (const order of orders) {
    // 2a. Shipment Tracking
    await prisma.shipmentTracking.upsert({
      where: { orderId: order.id },
      update: {},
      create: {
        orderId: order.id,
        shipmentType: 'LAND_CARGO',
        vesselName: 'Truck Hino BISA-01',
        vesselType: 'TRUCK_CARGO',
        originHub: 'Semarang Warehouse',
        destinationHub: 'Surabaya Industrial Center',
        currentLat: -7.2575,
        currentLng: 112.7521,
        estimatedSpeed: '60 km/h',
        batchId: `BATCH-${faker.string.alphanumeric(6).toUpperCase()}`,
      },
    });

    // 2b. Reviews (Only for some orders)
    if (order.status === 'COMPLETED') {
      const orderItem = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
      if (orderItem) {
        await prisma.review.upsert({
          where: { orderId: order.id },
          update: {},
          create: {
            orderId: order.id,
            buyerId: order.buyerId,
            productId: orderItem.productId,
            rating: faker.number.int({ min: 4, max: 5 }),
            comment:
              'Kualitas biochar sangat baik, pengiriman juga tepat waktu. Sangat direkomendasikan!',
            imageUrl: loremFlickrDbPath('biomass', { lock: order.id.charCodeAt(0) % 900 + 1 }),
          },
        });
      }
    }
  }

  // 3. SEED NOTIFICATIONS (elite demo users)
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

  // 4. SEED AUDIT LOGS
  const admin = users.admin;
  if (admin) {
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
      ],
    });
  }

  logger.info('✅ [10] Complex Operations (Negotiations, Chat, Reviews, Logs) seeded.');
}
