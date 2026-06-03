import logger from '../../src/config/logger.js';

export async function seedTransactions(prisma, users) {
  logger.info('🌱 [08] Seeding Standalone Transactions (langganan PRO & riwayat dompet)...');

  // Hanya hapus transaksi tanpa order — order diurus seeder [15]
  await prisma.transaction.deleteMany({ where: { orderId: null } });

  const { hendra, siti, green } = users;
  if (siti) {
    const salesAmount = 25_000_000;
    await prisma.transaction.create({
      data: {
        userId: siti.id,
        amount: salesAmount,
        sellerAmount: salesAmount * 0.97,
        platformFee: salesAmount * 0.03,
        status: 'RELEASED',
        paymentStatus: 'SUCCESS',
        type: 'SALES',
        paidAt: new Date(Date.now() - 7 * 86400000),
        escrowReleasedAt: new Date(Date.now() - 3 * 86400000),
      },
    });
  }

  // 3. PRO SUBSCRIPTION TRANSACTIONS (The ones without Order ID)
  const paymentChannel = await prisma.paymentChannel.findFirst({
    where: { code: 'MANDIRI' },
  });

  const proUsers = [hendra, siti, green].filter(Boolean);
  for (const user of proUsers) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: 250000, // Monthly Pro Fee
        status: 'RELEASED',
        paymentStatus: 'SUCCESS',
        type: 'SUBSCRIPTION', // <--- Important: Type from Enum
        paymentChannelId: paymentChannel?.id,
        paidAt: new Date(),
        feeBreakdownSnapshot: JSON.stringify({
          feeName: 'SUBSCRIPTION',
          type: 'FIXED',
          appliedValue: 250000,
        }),
      },
    });
  }

  // 4. RANDOM BULK TRANSACTIONS (riwayat pembayaran buyer tanpa order)
  if (users.allBuyers?.length) {
    for (let i = 0; i < 5; i++) {
      const buyer = users.allBuyers[i % users.allBuyers.length];
      const total = 1_000_000 + i * 500_000;
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
  }

  logger.info('✅ [08] Standalone transactions seeded.');
}
