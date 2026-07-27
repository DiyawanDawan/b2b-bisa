import prisma from '../src/config/prisma';
import logger from '../src/config/logger';

async function backfillFeeBreakdown() {
  const total = await prisma.order.count();
  logger.info(`Total orders: ${total}`);

  let done = 0;
  let skip = 0;
  const BATCH = 500;

  for (let offset = 0; offset < total; offset += BATCH) {
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        subtotal: true,
        platformFee: true,
        logisticsFee: true,
        vatAmount: true,
        feeBreakdownSnapshot: true,
      },
      skip: offset,
      take: BATCH,
    });

    for (const order of orders) {
      if (order.feeBreakdownSnapshot) {
        skip++;
        continue;
      }

      const platformFee = Number(order.platformFee);
      const logisticsFee = Number(order.logisticsFee);
      const vatAmount = Number(order.vatAmount);

      const snapshot = {
        platformFee: { type: 'PERCENTAGE', rate: 0.03, amount: platformFee },
        logisticsFee: { type: 'FIXED', amount: logisticsFee },
        vat: { type: 'PERCENTAGE', rate: 0.11, amount: vatAmount },
        totalFees: platformFee + logisticsFee + vatAmount,
      };

      await prisma.order.update({
        where: { id: order.id },
        data: { feeBreakdownSnapshot: snapshot },
      });
      done++;
    }
  }

  logger.info(`✅ fee_breakdown_snapshot: ${done} orders di-backfill, ${skip} sudah ada.`);
}

async function main() {
  logger.info('🔧 [FEE-BACKFILL] Backfill fee_breakdown_snapshot...\n');
  await backfillFeeBreakdown();
  logger.info('\n🎉 [FEE-BACKFILL] Selesai.');
}

main()
  .catch((err) => {
    logger.error('[FEE-BACKFILL] Gagal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
