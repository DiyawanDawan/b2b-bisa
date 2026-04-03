import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedOperations(prisma, users) {
  logger.info('🌱 [10] Seeding Complex Operations (Negotiations, Reviews, Logs)...');

  await prisma.negotiation.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.shipmentTracking.deleteMany({});

  const { allSuppliers, allBuyers } = users;
  const products = await prisma.product.findMany();
  const orders = await prisma.order.findMany();

  if (!allSuppliers.length || !allBuyers.length || !products.length) {
    logger.warn('⚠️ Missing dependencies for operations seeding.');
    return;
  }

  // 1. SEED NEGOTIATIONS & CHAT
  for (let i = 0; i < 5; i++) {
    const buyer = faker.helpers.arrayElement(allBuyers);
    const product = faker.helpers.arrayElement(products);
    const amount = faker.number.float({ min: 1000000, max: 10000000, fractionDigits: 2 });

    const negotiation = await prisma.negotiation.create({
      data: {
        productId: product.id,
        buyerId: buyer.id,
        sellerId: product.userId,
        quantityKg: faker.number.float({ min: 100, max: 1000, fractionDigits: 2 }),
        pricePerKg: amount / 1000,
        totalEstimate: amount,
        status: 'OPEN_NEGOTIATION',
      },
    });

    // Seed Chat Messages for this negotiation
    await prisma.chatMessage.createMany({
      data: [
        {
          negotiationId: negotiation.id,
          senderId: buyer.id,
          content: 'Halo, apakah stok Biochar ini masih tersedia?',
        },
        {
          negotiationId: negotiation.id,
          senderId: product.userId,
          content: 'Halo! Stok aman pak. Mau ambil berapa ton?',
        },
        {
          negotiationId: negotiation.id,
          senderId: buyer.id,
          content: 'Rencana 1.5 ton untuk pengiriman minggu depan.',
          attachmentUrl: 'https://bisa.es/docs/spec.pdf',
        },
      ],
    });
  }

  // 2. SEED SHIPMENT TRACKING & REVIEWS (For existing orders)
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
            imageUrl: faker.image.urlLoremFlickr({ category: 'business' }),
          },
        });
      }
    }
  }

  // 3. SEED NOTIFICATIONS
  for (const user of allBuyers.slice(0, 3)) {
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: 'Order Terkonfirmasi',
          body: 'Pesanan Anda #BISA-99283 telah dikonfirmasi oleh supplier.',
          type: 'ORDER_STATUS',
          priority: 'HIGH',
        },
        {
          userId: user.id,
          title: 'Pesan Baru',
          body: 'Siti Aminah membalas negosiasi Anda.',
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
