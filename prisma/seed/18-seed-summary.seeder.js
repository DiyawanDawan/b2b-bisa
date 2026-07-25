import logger from '../../src/config/logger.js';

/**
 * Ringkasan jumlah data setelah seed — untuk validasi cepat.
 */
export async function seedSummary(prisma) {
  logger.info('📊 [18] Validasi ringkasan data seed...');

  const [
    users,
    suppliers,
    products,
    organicPreHarvest,
    harvestLots,
    bookings,
    productSpecs,
    storeBanners,
    iotDevices,
    iotReadings,
    negotiations,
    orders,
    faqs,
    categories,
    collections,
    payoutPending,
    productQuestions,
    rfqs,
    supportTickets,
    platformSettings,
    articles,
    forumPosts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'SUPPLIER' } }),
    prisma.product.count(),
    prisma.product.count({
      where: { productMode: 'ORGANIC_PRODUCE', availabilityType: 'PRE_HARVEST' },
    }),
    prisma.productHarvestLot.count(),
    prisma.booking.count(),
    prisma.productSpec.count(),
    prisma.storeBanner.count(),
    prisma.iotDevice.count(),
    prisma.iotReading.count(),
    prisma.negotiation.count(),
    prisma.order.count(),
    prisma.faq.count(),
    prisma.category.count(),
    prisma.productCollection.count(),
    prisma.transaction.count({ where: { type: 'PAYOUT', status: 'PENDING' } }),
    prisma.productQuestion.count(),
    prisma.rfq.count(),
    prisma.supportTicket.count({ where: { subject: { startsWith: '[SEED]' } } }),
    prisma.platformSetting.count(),
    prisma.article.count(),
    prisma.forumPost.count(),
  ]);

  const [
    productStatusDist,
    articleStatusDist,
    forumStatusDist,
    kycStatusDist,
    certStatusDist,
    harvestStatusDist,
    liveStatusDist,
    knowledgeStatusDist,
    productsAboveL3,
    flaggedQuestions,
    flaggedRfqs,
    aiHandoffTickets,
  ] = await Promise.all([
    prisma.product.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.article.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.forumPost.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.userVerification.groupBy({ by: ['verificationStatus'], _count: { _all: true } }),
    prisma.productCertificate.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.productHarvestLot.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.liveSession.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.knowledgeDocument.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.product.count({
      where: {
        OR: [{ category: null }, { category: { level: { not: 3 } } }],
      },
    }),
    prisma.productQuestion.count({ where: { OR: [{ isFlagged: true }, { isHidden: true }] } }),
    prisma.rfq.count({ where: { isFlagged: true } }),
    prisma.supportTicket.count({ where: { source: 'AI_HANDOFF' } }),
  ]);

  const toDist = (rows, key = 'status') =>
    Object.fromEntries(
      rows.map((r) => [r[key] ?? r.status ?? r.verificationStatus, r._count._all]),
    );

  const summary = {
    users,
    suppliers,
    products,
    organicPreHarvest,
    harvestLots,
    bookings,
    productSpecs,
    storeBanners,
    iotDevices,
    iotReadings,
    negotiations,
    orders,
    faqs,
    categories,
    collections,
    payoutPending,
    productQuestions,
    rfqs,
    supportTickets,
    platformSettings,
    articles,
    forumPosts,
    productsAboveL3,
    flaggedQuestions,
    flaggedRfqs,
    aiHandoffTickets,
    productStatus: toDist(productStatusDist),
    articleStatus: toDist(articleStatusDist),
    forumStatus: toDist(forumStatusDist),
    kycStatus: toDist(kycStatusDist, 'verificationStatus'),
    productCertStatus: toDist(certStatusDist),
    harvestLotStatus: toDist(harvestStatusDist),
    liveSessionStatus: toDist(liveStatusDist),
    knowledgeStatus: toDist(knowledgeStatusDist),
  };

  logger.info('📊 Seed summary:', summary);

  const warnings = [];
  if (suppliers === 0) warnings.push('Tidak ada supplier');
  if (products === 0) warnings.push('Tidak ada produk');
  if (organicPreHarvest === 0) warnings.push('Tidak ada produk organik PRE_HARVEST');
  if (harvestLots === 0) warnings.push('Tidak ada harvest lots');
  if (bookings === 0) warnings.push('Tidak ada booking');
  if (productSpecs === 0) warnings.push('Tidak ada product_specs');
  if (storeBanners === 0) warnings.push('Tidak ada store_banners');
  if (iotDevices === 0) warnings.push('Tidak ada perangkat IoT');
  if (faqs === 0) warnings.push('Tidak ada FAQ');
  if (platformSettings === 0) warnings.push('Tidak ada platform settings');
  if (productsAboveL3 > 0) {
    warnings.push(`${productsAboveL3} produk terpasang di kategori di atas L3 / tanpa kategori`);
  }

  const requiredProductStatuses = [
    'ACTIVE',
    'DRAFT',
    'INACTIVE',
    'BLOCKED',
    'OUT_OF_STOCK',
    'DELETED',
  ];
  for (const st of requiredProductStatuses) {
    if (!summary.productStatus[st]) warnings.push(`ProductStatus ${st} kosong`);
  }

  for (const st of ['PUBLISHED', 'DRAFT', 'ARCHIVED']) {
    if (!summary.articleStatus[st]) warnings.push(`Article ${st} kosong`);
    if (!summary.forumStatus[st]) warnings.push(`ForumPost ${st} kosong`);
  }

  for (const st of ['PENDING', 'VERIFIED', 'REJECTED']) {
    if (!summary.kycStatus[st]) warnings.push(`KYC ${st} kosong`);
  }

  if (flaggedQuestions === 0) warnings.push('Tidak ada Q&A flagged/hidden');
  if (flaggedRfqs === 0) warnings.push('Tidak ada RFQ flagged');
  if (aiHandoffTickets === 0) warnings.push('Tidak ada support AI_HANDOFF');

  const suppliersMissingActiveBanner = await prisma.user.count({
    where: {
      role: 'SUPPLIER',
      storeBanners: { none: { isActive: true } },
    },
  });

  if (suppliers > 0 && suppliersMissingActiveBanner > 0) {
    warnings.push(`${suppliersMissingActiveBanner} supplier tanpa banner toko aktif`);
  }

  if (warnings.length > 0) {
    logger.warn(`⚠️ [18] Data belum lengkap: ${warnings.join(', ')}`);
  } else {
    logger.info('✅ [18] Semua modul inti memiliki data seed.');
  }

  return summary;
}
