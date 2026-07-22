import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedEngagement(prisma, users) {
  logger.info('🌱 [30] Seeding engagement (Q&A, RFQ, cart, vouchers, likes, follows)...');

  await prisma.voucherRedemption.deleteMany({});
  await prisma.rfqResponse.deleteMany({});
  await prisma.rfq.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.productQuestion.deleteMany({});
  await prisma.productLike.deleteMany({});
  await prisma.userFollow.deleteMany({});

  const buyer = users?.hendra ?? users?.allBuyers?.[0];
  const suppliers = [users?.siti, users?.green, ...(users?.allSuppliers ?? [])].filter(Boolean);
  const supplierIds = [...new Set(suppliers.map((s) => s.id))];

  if (!buyer) {
    logger.warn('⚠️ [30] Buyer tidak ditemukan.');
    return;
  }

  const flagshipProducts = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: 'Demo' } },
        { productMode: 'ORGANIC_PRODUCE', availabilityType: { in: ['PRE_HARVEST', 'MIXED'] } },
      ],
    },
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      minOrder: true,
      userId: true,
    },
  });

  const biomassProduct = await prisma.product.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, minOrder: true, userId: true },
  });

  const products = [...flagshipProducts];
  if (biomassProduct && !products.find((p) => p.id === biomassProduct.id)) {
    products.push(biomassProduct);
  }

  // Product Q&A
  let qaCount = 0;
  for (const product of products.slice(0, 6)) {
    const questions = [
      'Apakah stok ready untuk pengiriman minggu ini?',
      'Bisa kirim sample dulu sebelum order besar?',
      'Bagaimana ketahanan produk setelah panen?',
    ];
    for (let q = 0; q < 2; q++) {
      await prisma.productQuestion.create({
        data: {
          productId: product.id,
          askerId: buyer.id,
          question: questions[(qaCount + q) % questions.length],
          answer:
            q === 0 ? 'Stok tersedia sesuai jadwal panen. Silakan booking jika pre-harvest.' : null,
          answeredAt: q === 0 ? new Date() : null,
          answeredById: q === 0 ? product.userId : null,
        },
      });
      qaCount++;
    }
  }

  // RFQ
  const catBiochar = await prisma.category.findFirst({
    where: { productMode: 'BIOMASS_MATERIAL', biomassaType: 'BIOCHAR' },
  });
  const catOrganic = await prisma.category.findFirst({ where: { name: 'Beras Organik' } });

  const rfqDefs = [
    {
      title: 'RFQ Biochar Grade A 50 Ton',
      productMode: 'BIOMASS_MATERIAL',
      biomassaType: 'BIOCHAR',
      categoryId: catBiochar?.id,
      quantity: 50,
      status: 'OPEN',
    },
    {
      title: 'RFQ Beras Organik 2 Ton/bulan',
      productMode: 'ORGANIC_PRODUCE',
      biomassaType: 'OTHER',
      categoryId: catOrganic?.id,
      quantity: 2,
      status: 'OPEN',
    },
    {
      title: 'RFQ Sayur Organik Grosir',
      productMode: 'ORGANIC_PRODUCE',
      biomassaType: 'OTHER',
      categoryId: catOrganic?.id,
      quantity: 500,
      status: 'MATCHED',
    },
    {
      title: 'RFQ Sekam Padi Industri',
      productMode: 'BIOMASS_MATERIAL',
      biomassaType: 'SEKAM_PADI',
      categoryId: catBiochar?.id,
      quantity: 120,
      status: 'CLOSED',
    },
    {
      title: 'RFQ Jagung Premium Pre-Harvest',
      productMode: 'ORGANIC_PRODUCE',
      biomassaType: 'OTHER',
      categoryId: catOrganic?.id,
      quantity: 10,
      status: 'EXPIRED',
    },
  ];

  let rfqCount = 0;
  let responseCount = 0;
  for (const def of rfqDefs) {
    const rfq = await prisma.rfq.create({
      data: {
        buyerId: buyer.id,
        title: def.title,
        productMode: def.productMode,
        biomassaType: def.biomassaType,
        categoryId: def.categoryId,
        quantity: def.quantity,
        specifications: 'Spesifikasi demo seed — kualitas premium, sertifikat jika ada.',
        deliveryDate: faker.date.soon({ days: 30 }),
        budgetMax: faker.number.int({ min: 5_000_000, max: 50_000_000 }),
        status: def.status,
      },
    });
    rfqCount++;

    const responders = supplierIds.slice(0, 2);
    for (const supplierId of responders) {
      await prisma.rfqResponse.create({
        data: {
          rfqId: rfq.id,
          supplierId,
          message: `Penawaran dari supplier demo untuk ${def.title}.`,
        },
      });
      responseCount++;
    }
  }

  // Cart items
  let cartCount = 0;
  for (const product of products.slice(0, 4)) {
    await prisma.cartItem.create({
      data: {
        userId: buyer.id,
        productId: product.id,
        quantity: Math.max(Number(product.minOrder ?? 1), 10),
      },
    });
    cartCount++;
  }

  // Voucher redemptions
  const voucher = await prisma.voucher.findFirst({ where: { code: 'BISA10' } });
  const completedOrder = await prisma.order.findFirst({
    where: { buyerId: buyer.id, status: 'COMPLETED' },
    select: { id: true },
  });
  let redemptionCount = 0;
  if (voucher && completedOrder) {
    await prisma.voucherRedemption.create({
      data: {
        voucherId: voucher.id,
        userId: buyer.id,
        orderId: completedOrder.id,
        discountAmount: 50000,
      },
    });
    await prisma.voucher.update({
      where: { id: voucher.id },
      data: { usageCount: { increment: 1 } },
    });
    redemptionCount = 1;
  }

  // Likes & follows
  let likeCount = 0;
  for (const product of products) {
    await prisma.productLike.create({
      data: { userId: buyer.id, productId: product.id },
    });
    likeCount++;
  }

  let followCount = 0;
  for (const supplierId of supplierIds.slice(0, 4)) {
    if (supplierId === buyer.id) continue;
    await prisma.userFollow.create({
      data: { followerId: buyer.id, followingId: supplierId },
    });
    followCount++;
  }

  logger.info(
    `✅ [30] Engagement: ${qaCount} Q&A, ${rfqCount} RFQ (${responseCount} responses), ${cartCount} cart, ${redemptionCount} voucher redemption, ${likeCount} likes, ${followCount} follows.`,
  );
}
