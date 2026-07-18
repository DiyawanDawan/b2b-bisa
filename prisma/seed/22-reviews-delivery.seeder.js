import logger from '../../src/config/logger.js';
import { loremFlickrDbPath } from '../../src/utils/loremFlickrMedia.util.ts';

const REVIEW_TEMPLATES = [
  {
    rating: 5,
    comment:
      'Kualitas produk sesuai spesifikasi, packing rapi, dan pengiriman tepat waktu. Foto bukti terima kami lampirkan. Sangat direkomendasikan!',
    reply:
      'Terima kasih atas ulasannya. Senang batch ini memenuhi standar QC Anda. Siap order berikutnya kapan saja.',
  },
  {
    rating: 5,
    comment:
      'Barang sampai aman, moisture & grade sesuai CoA. Tim gudang kami sudah verifikasi di lokasi. Recommended supplier.',
    reply: 'Makasih konfirmasinya. Kami jaga konsistensi grade di setiap batch.',
  },
  {
    rating: 4,
    comment:
      'Produk bagus, sedikit delay 1 hari tapi seller komunikatif. Overall puas, akan repeat order.',
    reply: 'Mohon maaf keterlambatan kemarin. Slot logistik sudah kami perbaiki.',
  },
  {
    rating: 4,
    comment:
      'Isi jumbo bag sesuai tonase. Ada sedikit debu di luar karung tapi isi dalam aman. Rating 4 bintang.',
    reply: 'Noted — kami tambah double wrap untuk pengiriman berikutnya.',
  },
  {
    rating: 3,
    comment:
      'Kualitas OK, tapi estimasi tiba meleset 2 hari. Harap update tracking lebih sering. Bukti terima terlampir.',
    reply: 'Terima kasih feedback-nya. Kami akan kirim update ETA harian ke depan.',
  },
];

function reviewImages(lockBase) {
  return JSON.stringify([
    loremFlickrDbPath(['delivery', 'warehouse', 'cargo'], { lock: lockBase }),
    loremFlickrDbPath(['package', 'box', 'received'], { lock: lockBase + 1 }),
  ]);
}

function podPhotos(lockBase) {
  return [
    loremFlickrDbPath(['truck', 'delivery', 'proof'], { lock: lockBase }),
    loremFlickrDbPath(['signature', 'handover', 'receipt'], { lock: lockBase + 1 }),
  ];
}

function buildTrackingSnapshot({ awb, courier, deliveredAt, photos }) {
  return {
    awb,
    courier,
    status: 'DELIVERED',
    deliveredAt: deliveredAt.toISOString(),
    proofOfDelivery: {
      photos,
      receiverName: 'Petugas Gudang',
      note: 'Barang diterima lengkap, packing utuh.',
    },
    history: [
      {
        date: new Date(deliveredAt.getTime() - 3 * 86400000).toISOString(),
        description: 'Paket telah di-pickup dari gudang asal',
        location: 'Semarang Hub',
      },
      {
        date: new Date(deliveredAt.getTime() - 1 * 86400000).toISOString(),
        description: 'Dalam perjalanan ke kota tujuan',
        location: 'Transit Surabaya',
      },
      {
        date: deliveredAt.toISOString(),
        description: 'Paket telah diterima penerima',
        location: 'Surabaya Industrial Hub',
        photos,
      },
    ],
  };
}

async function recalculateProductRatings(prisma, productIds) {
  const unique = [...new Set(productIds.filter(Boolean))];
  for (const productId of unique) {
    const agg = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { id: true },
    });
    await prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        totalReviews: agg._count.id,
      },
    });
  }
}

/**
 * Seed ulasan (rating + foto), bukti pengiriman (POD), payment proof, dan evidence dispute.
 * Aman dijalankan ulang.
 */
export async function seedReviewsAndDeliveryProofs(prisma) {
  logger.info('🌱 [22] Seeding reviews, shipment POD, payment proof & dispute evidence...');

  const completedOrders = await prisma.order.findMany({
    where: { status: 'COMPLETED' },
    include: {
      items: { take: 1, select: { productId: true } },
      transaction: { select: { id: true } },
      buyer: { select: { fullName: true } },
      seller: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const shippedOrders = await prisma.order.findMany({
    where: { status: { in: ['SHIPPED', 'PROCESSING', 'CONFIRMED'] } },
    select: { id: true, buyerId: true, sellerId: true },
    take: 20,
  });

  const disputedOrders = await prisma.order.findMany({
    where: { status: 'DISPUTED' },
    include: { dispute: true },
    take: 10,
  });

  if (completedOrders.length === 0) {
    logger.warn(
      '⚠️ [22] Tidak ada order COMPLETED. Jalankan dulu: seed orders (15) lalu seed ini lagi.',
    );
  }

  let reviewCount = 0;
  let shipmentCount = 0;
  let paymentProofCount = 0;
  const touchedProductIds = [];

  // ─── Reviews + POD untuk order COMPLETED ─────────────────
  for (let i = 0; i < completedOrders.length; i++) {
    const order = completedOrders[i];
    const productId = order.items[0]?.productId;
    if (!productId) continue;

    const template = REVIEW_TEMPLATES[i % REVIEW_TEMPLATES.length];
    const deliveredAt = new Date(Date.now() - (i + 2) * 86400000);
    const awb = `BISA${String(100000 + i).slice(-6)}POD`;
    const courier = i % 2 === 0 ? 'jne' : 'sicepat';
    const photos = podPhotos(12000 + i * 3);

    await prisma.shipmentTracking.upsert({
      where: { orderId: order.id },
      update: {
        shipmentType: 'LAND_CARGO',
        vesselName: `Truck BISA-${String(i + 1).padStart(2, '0')}`,
        vesselType: 'TRUCK_CARGO',
        originHub: 'Semarang Warehouse',
        destinationHub: 'Surabaya Industrial Center',
        awbNumber: awb,
        courierCode: courier,
        deliveryStatus: 'DELIVERED',
        recipientPhoneLast5: '67890',
        lastTrackedAt: deliveredAt,
        trackingSnapshot: buildTrackingSnapshot({
          awb,
          courier,
          deliveredAt,
          photos,
        }),
        currentLat: -7.2575,
        currentLng: 112.7521,
        estimatedSpeed: '0 km/h',
        batchId: `BATCH-POD-${i + 1}`,
        packagingType: 'JUMBO_BAG',
        aiInsight: 'Pengiriman selesai. Bukti serah terima (POD) tersedia.',
      },
      create: {
        orderId: order.id,
        shipmentType: 'LAND_CARGO',
        vesselName: `Truck BISA-${String(i + 1).padStart(2, '0')}`,
        vesselType: 'TRUCK_CARGO',
        originHub: 'Semarang Warehouse',
        destinationHub: 'Surabaya Industrial Center',
        awbNumber: awb,
        courierCode: courier,
        deliveryStatus: 'DELIVERED',
        recipientPhoneLast5: '67890',
        lastTrackedAt: deliveredAt,
        trackingSnapshot: buildTrackingSnapshot({
          awb,
          courier,
          deliveredAt,
          photos,
        }),
        currentLat: -7.2575,
        currentLng: 112.7521,
        estimatedSpeed: '0 km/h',
        batchId: `BATCH-POD-${i + 1}`,
        packagingType: 'JUMBO_BAG',
        aiInsight: 'Pengiriman selesai. Bukti serah terima (POD) tersedia.',
      },
    });
    shipmentCount += 1;

    await prisma.review.upsert({
      where: { orderId: order.id },
      update: {
        rating: template.rating,
        comment: template.comment,
        supplierReply: template.reply,
        imageUrl: reviewImages(13000 + i * 2),
      },
      create: {
        orderId: order.id,
        buyerId: order.buyerId,
        productId,
        rating: template.rating,
        comment: template.comment,
        supplierReply: template.reply,
        imageUrl: reviewImages(13000 + i * 2),
      },
    });
    reviewCount += 1;
    touchedProductIds.push(productId);

    if (order.transaction?.id) {
      await prisma.transaction.update({
        where: { id: order.transaction.id },
        data: {
          paymentProofUrl: loremFlickrDbPath(['receipt', 'transfer', 'bank'], {
            lock: 14000 + i,
          }),
        },
      });
      paymentProofCount += 1;
    }
  }

  // ─── Shipment in-transit untuk order belum selesai ───────
  for (let i = 0; i < shippedOrders.length; i++) {
    const order = shippedOrders[i];
    const awb = `BISA${String(200000 + i).slice(-6)}TRK`;
    await prisma.shipmentTracking.upsert({
      where: { orderId: order.id },
      update: {
        awbNumber: awb,
        courierCode: 'jnt',
        deliveryStatus: 'ON_DELIVERY',
        lastTrackedAt: new Date(),
        trackingSnapshot: {
          awb,
          courier: 'jnt',
          status: 'ON_DELIVERY',
          history: [
            {
              date: new Date(Date.now() - 2 * 86400000).toISOString(),
              description: 'Paket di-pickup',
              location: 'Semarang Hub',
            },
            {
              date: new Date().toISOString(),
              description: 'Kurir menuju alamat tujuan',
              location: 'Surabaya',
            },
          ],
        },
        vesselName: `Truck BISA-INTRANSIT-${i + 1}`,
        originHub: 'Semarang Warehouse',
        destinationHub: 'Surabaya Industrial Center',
        currentLat: -7.3,
        currentLng: 112.7,
        estimatedSpeed: '55 km/h',
        batchId: `BATCH-TRK-${i + 1}`,
      },
      create: {
        orderId: order.id,
        awbNumber: awb,
        courierCode: 'jnt',
        deliveryStatus: 'ON_DELIVERY',
        lastTrackedAt: new Date(),
        trackingSnapshot: {
          awb,
          courier: 'jnt',
          status: 'ON_DELIVERY',
          history: [
            {
              date: new Date(Date.now() - 2 * 86400000).toISOString(),
              description: 'Paket di-pickup',
              location: 'Semarang Hub',
            },
            {
              date: new Date().toISOString(),
              description: 'Kurir menuju alamat tujuan',
              location: 'Surabaya',
            },
          ],
        },
        shipmentType: 'LAND_CARGO',
        vesselName: `Truck BISA-INTRANSIT-${i + 1}`,
        vesselType: 'TRUCK_CARGO',
        originHub: 'Semarang Warehouse',
        destinationHub: 'Surabaya Industrial Center',
        currentLat: -7.3,
        currentLng: 112.7,
        estimatedSpeed: '55 km/h',
        batchId: `BATCH-TRK-${i + 1}`,
        packagingType: 'JUMBO_BAG',
      },
    });
    shipmentCount += 1;
  }

  // ─── Dispute: bukti buyer + bukti kirim seller ───────────
  let disputeEvidenceCount = 0;
  for (let i = 0; i < disputedOrders.length; i++) {
    const order = disputedOrders[i];
    if (!order.dispute) continue;
    const buyerEvidence = [
      loremFlickrDbPath(['damage', 'package', 'complaint'], { lock: 15000 + i * 2 }),
      loremFlickrDbPath(['product', 'quality', 'issue'], { lock: 15001 + i * 2 }),
    ];
    const sellerEvidence = podPhotos(16000 + i * 2);
    await prisma.orderDispute.update({
      where: { id: order.dispute.id },
      data: {
        evidenceUrls: buyerEvidence,
        sellerEvidenceUrls: sellerEvidence,
        sellerResponse:
          'Kami lampirkan bukti serah terima (POD) dan foto kondisi saat kirim. Mohon ditinjau admin.',
        sellerRespondedAt: new Date(Date.now() - 86400000),
      },
    });
    disputeEvidenceCount += 1;
  }

  await recalculateProductRatings(prisma, touchedProductIds);

  logger.info(
    `✅ [22] Reviews=${reviewCount}, shipments=${shipmentCount}, paymentProof=${paymentProofCount}, disputeEvidence=${disputeEvidenceCount}`,
  );
  return { reviewCount, shipmentCount, paymentProofCount, disputeEvidenceCount };
}
