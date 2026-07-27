import prisma from '#db';
import crypto from 'node:crypto';
import logger from '../../src/config/logger.js';

async function backfillPickupVehicleUnits() {
  const count = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt FROM shipping_pickup_vehicle_units`,
  );
  const vehicles = await prisma.shippingPickupVehicle.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });
  let needed = 0;
  for (const v of vehicles) {
    const units = v.code === 'Motor' ? ['KG'] : ['KG', 'TON'];
    needed += units.length;
  }
  if (Number(count[0].cnt) >= needed) {
    logger.info('   ↳ shipping_pickup_vehicle_units sudah lengkap, skip.');
    return 0;
  }
  let n = 0;
  for (const v of vehicles) {
    const units = v.code === 'Motor' ? ['KG'] : ['KG', 'TON'];
    for (const unit of units) {
      try {
        const id = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO shipping_pickup_vehicle_units (id, vehicle_id, unit) VALUES (?, ?, ?)`,
          id,
          v.id,
          unit,
        );
        n++;
      } catch (e) {
        // skip duplicate
      }
    }
  }
  logger.info(`✅ shipping_pickup_vehicle_units: ${n} unit ditambahkan.`);
  return n;
}

async function backfillOrderItems() {
  const existing = await prisma.orderItem.count();
  if (existing > 0) {
    logger.info('   ↳ order_items sudah ada, skip.');
    return 0;
  }
  const orders = await prisma.order.findMany({
    select: { id: true, sellerId: true, subtotal: true, totalQuantity: true },
  });
  if (!orders.length) return 0;

  const products = await prisma.product.findMany({
    select: { id: true, userId: true, pricePerUnit: true },
  });
  const bySeller = {};
  for (const p of products) {
    (bySeller[p.userId] ??= []).push(p);
  }

  let n = 0;
  for (const order of orders) {
    const pool = bySeller[order.sellerId];
    if (!pool || pool.length === 0) continue;
    const product = pool[n % pool.length];
    const qty = Number(order.totalQuantity) || 100;
    const pricePerUnit = Number(product.pricePerUnit) || 5000;
    try {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          quantity: qty,
          pricePerUnit,
          subtotal: qty * pricePerUnit,
        },
      });
      n++;
    } catch (e) {
      // duplicate or constraint, skip
    }
  }
  logger.info(`✅ order_items: ${n} item ditambahkan.`);
  return n;
}

async function backfillNegotiations() {
  const existing = await prisma.negotiation.count();
  if (existing > 0) {
    logger.info('   ↳ negotiations sudah ada, skip.');
    return 0;
  }

  const rfqResponses = await prisma.rfqResponse.findMany({
    include: { rfq: { select: { buyerId: true, productMode: true, quantity: true } } },
    take: 21,
  });
  const buyers = await prisma.user.findMany({ where: { role: 'BUYER' }, take: 5 });
  const suppliers = await prisma.user.findMany({ where: { role: 'SUPPLIER' }, take: 5 });
  const products = await prisma.product.findMany({
    select: { id: true, userId: true, pricePerUnit: true },
    take: 50,
  });
  const buyerProducts = products.filter((p) => suppliers.some((s) => s.id === p.userId));

  if (!buyers.length || !suppliers.length || !buyerProducts.length) {
    logger.warn('⚠️ Data user/produk tidak cukup untuk backfill negotiations.');
    return 0;
  }

  const statuses = [
    'OPEN_NEGOTIATION',
    'OFFER_SUBMITTED',
    'OFFER_ACCEPTED',
    'OFFER_REJECTED',
    'EXPIRED',
    'LOCKED',
    'CANCELLED',
  ];
  const linkedOrders = await prisma.order.findMany({
    where: { status: 'PENDING' },
    select: { id: true, buyerId: true, sellerId: true },
    take: 3,
  });

  let n = 0;
  for (let i = 0; i < statuses.length; i++) {
    for (let j = 0; j < 3; j++) {
      const buyer = buyers[(i * 3 + j) % buyers.length];
      const product = buyerProducts[(i * 3 + j) % buyerProducts.length];
      const sellerId = product.userId;
      const status = statuses[i];
      const qty = 800 + j * 200;
      const pricePerUnit = Number(product.pricePerUnit) * (status === 'OFFER_REJECTED' ? 0.85 : 1);
      const totalEstimate = qty * pricePerUnit;
      const createdAt =
        status === 'EXPIRED'
          ? new Date(Date.now() - 30 * 86400000)
          : new Date(Date.now() - ((i * 3 + j) % 7) * 86400000);
      const linkOrder = status === 'LOCKED' ? (linkedOrders[j]?.id ?? null) : null;

      try {
        await prisma.negotiation.create({
          data: {
            productId: product.id,
            buyerId: buyer.id,
            sellerId,
            orderId: linkOrder,
            quantity: qty,
            pricePerUnit,
            totalEstimate,
            specifications: `Negosiasi backfill ${status} — buyer: ${buyer.fullName}`,
            status,
            isLocked: status === 'LOCKED',
            createdAt,
            updatedAt: createdAt,
          },
        });
        n++;
      } catch (e) {
        // skip duplicates
      }
    }
  }
  logger.info(`✅ negotiations: ${n} negosiasi ditambahkan.`);
  return n;
}

async function backfillChatMessages() {
  const existing = await prisma.chatMessage.count();
  if (existing > 0) {
    logger.info('   ↳ chat_messages sudah ada, skip.');
    return 0;
  }
  const negotiations = await prisma.negotiation.findMany({
    include: {
      buyer: { select: { fullName: true } },
      seller: { select: { fullName: true } },
      product: { select: { name: true } },
    },
  });
  if (!negotiations.length) {
    logger.warn('⚠️ Tidak ada negotiations, skip chat_messages.');
    return 0;
  }

  const msgTemplates = {
    OPEN_NEGOTIATION: [
      { from: 'buyer', text: 'Halo, saya tertarik produk ini. Bisa nego harga?' },
      { from: 'seller', text: 'Bisa! Silakan sampaikan volume dan target harga.' },
      { from: 'buyer', text: 'Rencana ambil 2 ton, budget sekitar Rp 8 juta.' },
    ],
    OFFER_SUBMITTED: [
      { from: 'buyer', text: 'Saya ajukan Rp 4.200/kg untuk 1500 KG.' },
      { from: 'seller', text: 'Tawaran diterima review, mohon tunggu.' },
    ],
    OFFER_ACCEPTED: [
      { from: 'buyer', text: 'Final: Rp 4.350/kg total 6.5 juta all-in.' },
      { from: 'seller', text: 'Setuju. Lanjut buat kontrak order.' },
    ],
    OFFER_REJECTED: [
      { from: 'buyer', text: 'Rp 3.800/kg, budget terbatas.' },
      { from: 'seller', text: 'Maaf, di bawah harga minimum. Tawaran ditolak.' },
    ],
    EXPIRED: [
      { from: 'buyer', text: 'Masih bisa lanjut?' },
      { from: 'system', text: 'Negosiasi kedaluwarsa 72 jam tanpa respons.' },
    ],
    LOCKED: [{ from: 'seller', text: 'Kontrak dikunci, menunggu pembayaran.' }],
    CANCELLED: [
      { from: 'buyer', text: 'Mohon maaf, proyek ditunda. Dibatalkan.' },
      { from: 'seller', text: 'Baik, hubungi kami jika siap lanjut.' },
    ],
  };

  let n = 0;
  for (const neg of negotiations) {
    const msgs = msgTemplates[neg.status] || [
      { from: 'buyer', text: `Tertarik ${neg.product.name}.` },
    ];
    for (let idx = 0; idx < msgs.length; idx++) {
      const m = msgs[idx];
      try {
        await prisma.chatMessage.create({
          data: {
            negotiationId: neg.id,
            senderId: m.from === 'buyer' ? neg.buyerId : m.from === 'seller' ? neg.sellerId : null,
            content: m.text,
            isSystemMessage: m.from === 'system',
            createdAt: new Date(neg.createdAt.getTime() + (idx + 1) * 3600000),
          },
        });
        n++;
      } catch (e) {
        // skip
      }
    }
  }
  logger.info(`✅ chat_messages: ${n} pesan ditambahkan.`);
  return n;
}

async function backfillProductCollectionItems() {
  const existing = await prisma.productCollectionItem.count();
  if (existing > 0) {
    logger.info('   ↳ product_collection_items sudah ada, skip.');
    return 0;
  }
  const collections = await prisma.productCollection.findMany();
  if (!collections.length) {
    logger.warn('⚠️ Tidak ada product_collections, skip product_collection_items.');
    return 0;
  }

  let n = 0;
  for (const coll of collections) {
    let products;
    if (coll.slug === 'harga-termurah') {
      products = await prisma.product.findMany({
        where: { biomassaType: 'SEKAM_PADI' },
        take: 10,
        orderBy: { pricePerUnit: 'asc' },
      });
    } else if (coll.slug === 'rekomendasi-utama') {
      products = await prisma.product.findMany({
        where: { isCertified: true },
        take: 10,
        orderBy: { averageRating: 'desc' },
      });
    } else {
      products = await prisma.product.findMany({ take: 4 });
    }

    for (let i = 0; i < products.length; i++) {
      try {
        await prisma.productCollectionItem.create({
          data: {
            collectionId: coll.id,
            productId: products[i].id,
            order: i,
          },
        });
        n++;
      } catch (e) {
        // skip duplikat
      }
    }
  }
  logger.info(`✅ product_collection_items: ${n} item ditambahkan.`);
  return n;
}

async function main() {
  logger.info('🔧 [BACKFILL] Memulai backfill tabel kosong...\n');

  // Fase 1: Data yang tidak bergantung pada yg lain
  await backfillPickupVehicleUnits();
  await backfillProductCollectionItems();

  // Fase 2: Order items (butuh orders + products)
  await backfillOrderItems();

  // Fase 3: Negotiations (butuh orders + products + rfq)
  await backfillNegotiations();

  // Fase 4: Chat messages (butuh negotiations)
  await backfillChatMessages();

  logger.info('\n🎉 [BACKFILL] Selesai.');
}

main()
  .catch((err) => {
    logger.error('[BACKFILL] Gagal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
