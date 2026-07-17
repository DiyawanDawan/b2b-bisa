import logger from '../../src/config/logger.js';

const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
];

const NEGOTIATION_STATUSES = [
  'OPEN_NEGOTIATION',
  'OFFER_SUBMITTED',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'EXPIRED',
  'LOCKED',
  'CANCELLED',
];

function txForOrderStatus(status) {
  switch (status) {
    case 'PENDING':
      return { status: 'PENDING', paymentStatus: 'PENDING', paidAt: null, escrowReleasedAt: null };
    case 'CONFIRMED':
    case 'PROCESSING':
    case 'SHIPPED':
    case 'DISPUTED':
      return {
        status: 'ESCROW_HELD',
        paymentStatus: 'SUCCESS',
        paidAt: new Date(),
        escrowReleasedAt: null,
      };
    case 'COMPLETED':
      return {
        status: 'RELEASED',
        paymentStatus: 'SUCCESS',
        paidAt: new Date(Date.now() - 5 * 86400000),
        escrowReleasedAt: new Date(),
      };
    case 'CANCELLED':
      return { status: 'REFUNDED', paymentStatus: 'FAILED', paidAt: null, escrowReleasedAt: null };
    default:
      return { status: 'PENDING', paymentStatus: 'PENDING', paidAt: null, escrowReleasedAt: null };
  }
}

function buildOrderFinancials(subtotal) {
  const platformFee = subtotal * 0.03;
  const logisticsFee = 150000;
  const vatAmount = subtotal * 0.11;
  const totalAmount = subtotal + platformFee + logisticsFee + vatAmount;
  return { subtotal, platformFee, logisticsFee, vatAmount, totalAmount };
}

async function buildAddressSnapshot(prisma, buyer) {
  if (!buyer?.addressId) return null;
  const addr = await prisma.address.findUnique({
    where: { id: buyer.addressId },
    include: {
      province: { select: { name: true } },
      regency: { select: { name: true } },
    },
  });
  if (!addr) return null;
  return {
    recipient: buyer.fullName,
    phone: addr.phoneNumber ?? buyer.phone,
    email: buyer.email,
    address: addr.fullAddress,
    zipCode: addr.zipCode,
    province: addr.province?.name,
    regency: addr.regency?.name ?? buyer.regency,
  };
}

function negotiationMessages(status, buyerName, sellerName, productName) {
  const base = [
    { role: 'buyer', content: `Halo ${sellerName}, saya tertarik ${productName}. Bisa nego?` },
    {
      role: 'seller',
      content: `Halo ${buyerName}! Bisa, silakan sampaikan volume dan target harga.`,
    },
  ];
  const extras = {
    OPEN_NEGOTIATION: [
      { role: 'buyer', content: 'Rencana ambil 2 ton, kirim ke Surabaya minggu depan.' },
    ],
    OFFER_SUBMITTED: [
      { role: 'buyer', content: 'Saya ajukan Rp 4.200/kg untuk 1500 KG. Mohon pertimbangan.' },
      { role: 'seller', content: 'Tawaran diterima review, mohon tunggu konfirmasi formal.' },
    ],
    OFFER_ACCEPTED: [
      { role: 'buyer', content: 'Final offer: Rp 4.350/kg, total 6.5 juta all-in.' },
      { role: 'seller', content: 'Setuju. Saya terima tawaran, lanjut buat kontrak order.' },
    ],
    OFFER_REJECTED: [
      { role: 'buyer', content: 'Bagaimana jika Rp 3.800/kg? Budget kami terbatas.' },
      { role: 'seller', content: 'Maaf, di bawah harga minimum kami. Tawaran ditolak.' },
    ],
    EXPIRED: [
      { role: 'buyer', content: 'Apakah masih bisa lanjut negosiasi?' },
      { role: 'system', content: 'Negosiasi kedaluwarsa karena tidak ada respons 72 jam.' },
    ],
    LOCKED: [{ role: 'seller', content: 'Kontrak sudah dikunci menunggu pembayaran buyer.' }],
    CANCELLED: [
      { role: 'buyer', content: 'Mohon maaf, proyek kami ditunda. Negosiasi saya batalkan.' },
      { role: 'seller', content: 'Baik, negosiasi ditutup. Hubungi kami jika sudah siap lanjut.' },
    ],
  };
  return [...base, ...(extras[status] || [])];
}

export async function seedOrdersAndNegotiations(prisma, users) {
  logger.info('🌱 [15] Seeding Orders & Negotiations (matrix uji coba lengkap)...');

  const { hendra, siti, green, allBuyers } = users;
  if (!hendra || !siti || !allBuyers?.length) {
    logger.warn('⚠️ [15] User demo tidak lengkap, lewati seed order/negosiasi.');
    return { orderCount: 0, negotiationCount: 0 };
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true, userId: true, pricePerUnit: true, minOrder: true },
  });
  const sitiProducts = products.filter((p) => p.userId === siti.id);
  const greenProducts = products.filter((p) => p.userId === green?.id);
  const paymentChannel = await prisma.paymentChannel.findFirst({ where: { code: 'MANDIRI' } });

  if (sitiProducts.length === 0) {
    logger.warn('⚠️ [15] Produk supplier tidak ditemukan.');
    return { orderCount: 0, negotiationCount: 0 };
  }

  // Bersihkan data lama (urutan FK)
  await prisma.chatMessage.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.shipmentTracking.deleteMany({});
  await prisma.transaction.deleteMany({ where: { orderId: { not: null } } });
  await prisma.orderItem.deleteMany({});
  await prisma.negotiation.deleteMany({});
  await prisma.order.deleteMany({});

  const buyerPool = [hendra, ...allBuyers.filter((b) => b.id !== hendra.id)];
  const sellerProducts = [
    (i) => sitiProducts[i % sitiProducts.length],
    (i) =>
      greenProducts.length
        ? greenProducts[i % greenProducts.length]
        : sitiProducts[i % sitiProducts.length],
    (i) => sitiProducts[(i + 1) % sitiProducts.length],
  ];

  let orderCount = 0;
  let seq = 1;

  // ─── ORDERS: min 3 per status ─────────────────────────────
  for (const status of ORDER_STATUSES) {
    for (let i = 0; i < 3; i++) {
      const buyer = buyerPool[i % buyerPool.length];
      const product = sellerProducts[i](i);
      const sellerId = product.userId;
      const qty = Math.max(Number(product.minOrder) || 100, 500 + i * 100);
      const pricePerUnit = Number(product.pricePerUnit);
      const subtotal = qty * pricePerUnit;
      const fin = buildOrderFinancials(subtotal);
      const txMeta = txForOrderStatus(status);
      const orderNumber = `#BISA-SEED-${status.slice(0, 4)}-${String(seq).padStart(2, '0')}`;
      seq++;

      const sellerAmount = fin.subtotal - fin.platformFee;
      const shippingAddressSnapshot = await buildAddressSnapshot(prisma, buyer);

      await prisma.order.create({
        data: {
          orderNumber,
          buyerId: buyer.id,
          sellerId,
          status,
          subtotal: fin.subtotal,
          platformFee: fin.platformFee,
          logisticsFee: fin.logisticsFee,
          vatAmount: fin.vatAmount,
          totalAmount: fin.totalAmount,
          totalQuantity: qty,
          specifications: `Demo seed status ${status} — buyer: ${buyer.fullName}`,
          shippingAddressId: buyer.addressId,
          shippingAddressSnapshot,
          items: {
            create: [
              {
                productId: product.id,
                quantity: qty,
                pricePerUnit,
                subtotal: fin.subtotal,
              },
            ],
          },
          transaction: {
            create: {
              userId: buyer.id,
              amount: fin.totalAmount,
              platformFee: fin.platformFee,
              sellerAmount,
              status: txMeta.status,
              paymentStatus: txMeta.paymentStatus,
              type: 'SALES',
              paymentChannelId: paymentChannel?.id,
              paidAt: txMeta.paidAt,
              escrowReleasedAt: txMeta.escrowReleasedAt,
              externalId: `SEED-TXN-${orderNumber.replace(/#/g, '')}`,
            },
          },
          ...(status === 'DISPUTED'
            ? {
                dispute: {
                  create: {
                    raisedById: buyer.id,
                    reason: 'Seed: kualitas atau pengiriman tidak sesuai',
                    description: `Sengketa demo untuk ${orderNumber}.`,
                    evidenceUrls: [],
                    status: 'OPEN',
                  },
                },
              }
            : {}),
        },
      });
      orderCount++;
    }
  }

  // ─── NEGOTIATIONS: min 3 per status ───────────────────────
  let negotiationCount = 0;
  let negSeq = 1;
  const pendingOrdersForLocked = await prisma.order.findMany({
    where: { status: 'PENDING' },
    select: { id: true },
    take: 3,
  });

  for (const status of NEGOTIATION_STATUSES) {
    for (let i = 0; i < 3; i++) {
      const buyer = buyerPool[i % buyerPool.length];
      const product = sellerProducts[i](i + negSeq);
      const sellerId = product.userId;
      const qty = 800 + i * 200;
      const pricePerUnit = Number(product.pricePerUnit) * (status === 'OFFER_REJECTED' ? 0.85 : 1);
      const totalEstimate = qty * pricePerUnit;
      const isLocked = status === 'LOCKED';
      const createdAt =
        status === 'EXPIRED'
          ? new Date(Date.now() - 30 * 86400000)
          : new Date(Date.now() - (negSeq % 7) * 86400000);

      const linkOrder = status === 'LOCKED' ? (pendingOrdersForLocked[i]?.id ?? null) : null;

      const negotiation = await prisma.negotiation.create({
        data: {
          productId: product.id,
          buyerId: buyer.id,
          sellerId,
          orderId: linkOrder,
          quantity: qty,
          pricePerUnit,
          totalEstimate,
          specifications: `Demo negosiasi ${status} — ${buyer.fullName} ↔ supplier`,
          status,
          isLocked,
          createdAt,
          updatedAt: createdAt,
        },
      });

      const buyerName = buyer.fullName?.split(' ')[0] || 'Buyer';
      const sellerUser = [siti, green].find((s) => s?.id === sellerId);
      const sellerName = sellerUser?.fullName?.split(' ')[0] || 'Supplier';
      const msgs = negotiationMessages(status, buyerName, sellerName, product.name);

      await prisma.chatMessage.createMany({
        data: msgs.map((m, idx) => ({
          negotiationId: negotiation.id,
          senderId: m.role === 'buyer' ? buyer.id : sellerId,
          content: m.content,
          isSystemMessage: m.role === 'system',
          createdAt: new Date(createdAt.getTime() + (idx + 1) * 3600000),
        })),
      });

      negotiationCount++;
      negSeq++;
    }
  }

  logger.info(
    `✅ [15] ${orderCount} orders (${ORDER_STATUSES.length} status × 3) + ${negotiationCount} negosiasi (${NEGOTIATION_STATUSES.length} status × 3) seeded.`,
  );

  return {
    orderCount,
    negotiationCount,
    matrix: { orders: ORDER_STATUSES, negotiations: NEGOTIATION_STATUSES },
  };
}
