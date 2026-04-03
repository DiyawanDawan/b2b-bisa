import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedTransactions(prisma, users) {
  logger.info('🌱 [08] Seeding Elite Transactions & PRO Subscriptions...');

  await prisma.transaction.deleteMany({});
  await prisma.order.deleteMany({});

  const { hendra, siti, green, allBuyers } = users;
  const products = await prisma.product.findMany();

  if (!hendra || products.length < 2) {
    logger.warn('⚠️ Missing Hendra or products for elite seeding.');
    return;
  }

  // 1. SPECIFIC TRANSACTIONS FROM SCREENSHOT (Hendra Wijaya)
  const eliteTransactions = [
    {
      id: 'TXN-99283',
      orderNumber: '#BISA-0099283-TRX',
      productName: 'Premium Biochar Grade A',
      amount: 63000000,
      status: 'ESCROW_HELD',
      paymentStatus: 'PENDING',
      volume: 15,
    },
    {
      id: 'TXN-99275',
      orderNumber: '#BISA-0099275-TRX',
      productName: 'Coconut Shell Biochar',
      amount: 35000000,
      status: 'RELEASED',
      paymentStatus: 'SUCCESS',
      volume: 10,
    },
  ];

  for (const et of eliteTransactions) {
    const product = products.find((p) => p.name.includes('Biochar')) || products[0];

    await prisma.order.create({
      data: {
        orderNumber: et.orderNumber,
        buyerId: hendra.id,
        sellerId: product.userId,
        status: et.status === 'RELEASED' ? 'COMPLETED' : 'CONFIRMED',
        subtotal: et.amount,
        platformFee: et.amount * 0.03, // 3% Platform Fee
        logisticsFee: 150000, // Flat estimate
        vatAmount: et.amount * 0.11, // 11% VAT
        totalAmount: et.amount + et.amount * 0.11 + 150000,
        totalWeightKg: et.volume * 1000,
        shippingAddressId: hendra.addressId,
        items: {
          create: [
            {
              productId: product.id,
              quantityKg: et.volume * 1000,
              pricePerKg: et.amount / (et.volume * 1000),
              subtotal: et.amount,
            },
          ],
        },
        transaction: {
          create: {
            id: et.id,
            userId: hendra.id,
            amount: et.amount,
            status: et.status,
            paymentStatus: et.paymentStatus,
            type: 'SALES',
          },
        },
      },
    });
  }

  // 2. PRO SUBSCRIPTION TRANSACTIONS (The ones without Order ID)
  const proUsers = [hendra, siti, green];
  for (const user of proUsers) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: 250000, // Monthly Pro Fee
        status: 'RELEASED',
        paymentStatus: 'SUCCESS',
        type: 'SUBSCRIPTION', // <--- Important: Type from Enum
        paidAt: new Date(),
        feeBreakdownSnapshot: JSON.stringify({
          feeName: 'SUBSCRIPTION',
          type: 'FIXED',
          appliedValue: 250000,
        }),
      },
    });
  }

  // 3. RANDOM BULK TRANSACTIONS
  for (let i = 0; i < 10; i++) {
    const buyer = faker.helpers.arrayElement(allBuyers);
    const product = faker.helpers.arrayElement(products);
    const total = faker.number.float({ min: 1000000, max: 20000000 });

    await prisma.transaction.create({
      data: {
        userId: buyer.id,
        amount: total,
        status: 'RELEASED',
        paymentStatus: 'SUCCESS',
        type: 'SALES',
        paidAt: new Date(),
      },
    });
  }

  logger.info('✅ [08] Elite Transactions & Subscriptions seeded.');
}
