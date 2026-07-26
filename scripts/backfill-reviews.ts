import prisma from '../src/config/prisma';
import logger from '../src/config/logger';

const REVIEW_TEMPLATES = [
  { rating: 5, comment: 'Kualitas biomassa sangat baik! Pengiriman tepat waktu, dokumentasi lengkap.' },
  { rating: 4, comment: 'Produk sesuai spesifikasi. Sedikit keterlambatan kirim tapi overall puas.' },
  { rating: 5, comment: 'Supplier profesional, respon cepat. Harga kompetitif untuk grade A.' },
  { rating: 4, comment: 'Barang sampai dengan aman, packing rapi. Akan repeat order.' },
  { rating: 3, comment: 'Kualitas OK untuk harga segini. Ada beberapa yang kurang kering tapi masih bisa dipakai.' },
];

const ORGANIC_REVIEW_TEMPLATES = [
  { rating: 5, comment: 'Sayuran segar, panen langsung dari kebun. Rasa lebih enak dari yang di pasar.' },
  { rating: 4, comment: 'Beras organik berkualitas. Dikemas vakum, tidak ada kutu.' },
  { rating: 5, comment: 'Pengiriman pre-harvest sesuai jadwal. Buah matang sempurna saat tiba.' },
];

async function backfillReviews() {
  const existing = await prisma.review.count();
  if (existing > 0) {
    logger.info(`   reviews sudah ada ${existing} row, skip.`);
    return;
  }

  const completedOrders = await prisma.order.findMany({
    where: { status: 'COMPLETED' },
    include: {
      items: {
        take: 1,
        select: { productId: true, product: { select: { productMode: true } } },
      },
      buyer: { select: { fullName: true } },
      seller: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!completedOrders.length) {
    logger.warn('⚠️ Tidak ada order COMPLETED.');
    return;
  }

  let n = 0;
  for (let i = 0; i < completedOrders.length; i++) {
    const order = completedOrders[i];
    const productId = order.items[0]?.productId;
    if (!productId) continue;

    const isOrganic = order.items[0]?.product?.productMode === 'ORGANIC_PRODUCE';
    const pool = isOrganic ? ORGANIC_REVIEW_TEMPLATES : REVIEW_TEMPLATES;
    const tpl = pool[i % pool.length];

    try {
      await prisma.review.create({
        data: {
          orderId: order.id,
          buyerId: order.buyerId,
          productId,
          rating: tpl.rating,
          comment: tpl.comment,
        },
      });
      n++;
    } catch (e) {
      // duplicate unique constraint on order_id, skip
    }
  }

  logger.info(`✅ reviews: ${n} review ditambahkan.`);
}

async function main() {
  logger.info('🔧 [REVIEW-BACKFILL] Backfill reviews...\n');
  await backfillReviews();
  logger.info('\n🎉 [REVIEW-BACKFILL] Selesai.');
}

main()
  .catch((err) => { logger.error('[REVIEW-BACKFILL] Gagal:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
