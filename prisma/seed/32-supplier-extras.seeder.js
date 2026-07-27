import crypto from 'node:crypto';
import logger from '../../src/config/logger.js';
import { searchDomesticDestinations } from '../../src/services/rajaongkir.service.ts';

/**
 * Backfill rajaongkirOriginId untuk semua supplier yang belum punya data asal pengiriman.
 * Dipanggil setiap kali seed untuk memastikan tidak ada supplier yang menyebabkan error checkout 400.
 */
async function backfillSupplierShippingOrigins(prisma) {
  logger.info('   🔧 [32] Backfill rajaongkirOriginId untuk supplier yang belum punya data...');

  const suppliersWithoutOrigin = await prisma.userProfile.findMany({
    where: {
      rajaongkirOriginId: null,
      user: { role: 'SUPPLIER' },
    },
    select: { userId: true, user: { select: { regency: true, province: true } } },
  });

  // Also find suppliers with no profile at all
  const suppliersWithoutProfile = await prisma.user.findMany({
    where: {
      role: 'SUPPLIER',
      profile: null,
    },
    select: { id: true, regency: true, province: true },
  });

  const toBackfill = [
    ...suppliersWithoutOrigin.map((p) => ({
      id: p.userId,
      regency: p.user.regency,
      province: p.user.province,
    })),
    ...suppliersWithoutProfile.map((u) => ({ id: u.id, regency: u.regency, province: u.province })),
  ];

  let fixed = 0;
  for (const s of toBackfill) {
    const queries = [
      s.regency && s.province ? `${s.regency}, ${s.province}` : null,
      s.regency,
      s.province,
    ].filter((q) => !!q && q.length >= 3);

    let resolved = false;
    for (const query of queries) {
      try {
        const results = await searchDomesticDestinations({ search: query, limit: 5 });
        if (results.length > 0) {
          const originId = Number(results[0].id);
          if (!Number.isNaN(originId) && originId > 0) {
            await prisma.userProfile.upsert({
              where: { userId: s.id },
              create: {
                userId: s.id,
                rajaongkirOriginId: originId,
                rajaongkirOriginLabel: results[0].label ?? query,
              },
              update: {
                rajaongkirOriginId: originId,
                rajaongkirOriginLabel: results[0].label ?? query,
              },
            });
            fixed++;
            resolved = true;
            break;
          }
        }
      } catch {
        // Coba query berikutnya jika RajaOngkir API gagal.
      }
    }

    if (!resolved) {
      // Fallback: pastikan rajaongkirOriginId diisi dengan default valid (444 / Kota Surabaya)
      const fallbackId = 444;
      const fallbackLabel = `${s.regency ?? 'Kota Surabaya'}, ${s.province ?? 'Jawa Timur'}`;
      await prisma.userProfile.upsert({
        where: { userId: s.id },
        create: {
          userId: s.id,
          rajaongkirOriginId: fallbackId,
          rajaongkirOriginLabel: fallbackLabel,
        },
        update: {
          rajaongkirOriginId: fallbackId,
          rajaongkirOriginLabel: fallbackLabel,
        },
      });
      fixed++;
    }
  }

  if (fixed > 0) {
    logger.info(`   ✅ [32] Backfill: ${fixed} supplier berhasil diisi rajaongkirOriginId.`);
  } else if (toBackfill.length > 0) {
    logger.warn(
      `   ⚠️ [32] ${toBackfill.length} supplier masih belum bisa resolve asal pengiriman (RajaOngkir API unavailable?).`,
    );
  } else {
    logger.info('   ✅ [32] Semua supplier sudah punya rajaongkirOriginId.');
  }
}

export async function seedSupplierExtras(prisma, users) {
  logger.info('🌱 [32] Seeding supplier extras (API key, referral, live, knowledge, devices)...');

  // Always backfill shipping origins — idempotent, safe to re-run
  await backfillSupplierShippingOrigins(prisma);

  const existingExtras = await prisma.liveSession.count({
    where: { title: { startsWith: '[SEED]' } },
  });
  if (existingExtras > 0) {
    logger.info('   ↳ Supplier extras already seeded, skipping (data tidak dihapus)...');
    return;
  }

  const supplier = users?.siti ?? users?.allSuppliers?.[0];
  const buyer = users?.hendra ?? users?.allBuyers?.[0];
  const admin = users?.admin;

  if (!supplier || !buyer) {
    logger.warn('⚠️ [32] Supplier/buyer tidak ditemukan.');
    return;
  }

  const rawKey = `bisa_seed_demo_${supplier.id.slice(0, 8)}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  await prisma.supplierApiKey.create({
    data: {
      userId: supplier.id,
      name: 'Demo Integration Key',
      keyHash,
      keyPrefix: 'bisa_seed',
      isActive: true,
    },
  });

  const referredBuyers = (users?.allBuyers ?? []).filter((b) => b.id !== buyer.id);
  if (referredBuyers[0]) {
    await prisma.referralReward.create({
      data: {
        referrerId: buyer.id,
        referredUserId: referredBuyers[0].id,
        amount: 100_000,
        status: 'PENDING',
      },
    });
  }
  if (referredBuyers[1]) {
    const completedOrder = await prisma.order.findFirst({
      where: { buyerId: referredBuyers[1].id, status: 'COMPLETED' },
      select: { id: true },
    });
    if (completedOrder) {
      await prisma.referralReward.create({
        data: {
          referrerId: supplier.id,
          referredUserId: referredBuyers[1].id,
          orderId: completedOrder.id,
          amount: 250_000,
          status: 'CREDITED',
          creditedAt: new Date(),
        },
      });
    }
  }

  const organicProduct = await prisma.product.findFirst({
    where: { userId: supplier.id, productMode: 'ORGANIC_PRODUCE' },
    select: { id: true },
  });

  const liveSessions = [
    {
      title: '[SEED] Live Panen Organik Demo',
      description: 'Sesi live demo hasil tani & jadwal panen.',
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() + 3 * 86400000),
      startedAt: null,
      endedAt: null,
      viewerCount: 42,
    },
    {
      title: '[SEED] Live sekarang — QC biochar batch',
      description: 'Sesi LIVE demo seed untuk admin/moderation coverage.',
      status: 'LIVE',
      scheduledAt: new Date(Date.now() - 30 * 60000),
      startedAt: new Date(Date.now() - 25 * 60000),
      endedAt: null,
      viewerCount: 128,
      streamUrl: 'https://bisa.es/live/seed-demo',
    },
    {
      title: '[SEED] Live selesai — review panen minggu lalu',
      description: 'Replay/ENDED demo seed.',
      status: 'ENDED',
      scheduledAt: new Date(Date.now() - 5 * 86400000),
      startedAt: new Date(Date.now() - 5 * 86400000 + 3600000),
      endedAt: new Date(Date.now() - 5 * 86400000 + 7200000),
      viewerCount: 310,
    },
  ];

  let firstLiveId = null;
  for (const sess of liveSessions) {
    const live = await prisma.liveSession.create({
      data: {
        supplierId: supplier.id,
        title: sess.title,
        description: sess.description,
        status: sess.status,
        scheduledAt: sess.scheduledAt,
        startedAt: sess.startedAt,
        endedAt: sess.endedAt,
        streamUrl: sess.streamUrl ?? null,
        pinnedProductIds: organicProduct ? [organicProduct.id] : [],
        viewerCount: sess.viewerCount,
      },
    });
    if (!firstLiveId) firstLiveId = live.id;
  }

  const commentAuthors = [buyer, supplier].filter(Boolean);
  for (let i = 0; i < 3; i++) {
    await prisma.liveSessionComment.create({
      data: {
        sessionId: firstLiveId,
        userId: commentAuthors[i % commentAuthors.length].id,
        message: ['Kapan panen berikutnya?', 'Bisa booking 2 ton?', 'Kualitas organik terjaga?'][i],
      },
    });
  }

  if (admin) {
    await prisma.knowledgeDocument.createMany({
      data: [
        {
          title: '[SEED] Panduan Booking Pre-Harvest',
          description: 'Cara booking stok hasil tani sebelum panen.',
          sourceType: 'TEXT',
          status: 'INDEXED',
          chunkCount: 3,
          uploadedById: admin.id,
        },
        {
          title: '[SEED] Ketahanan Produk Organik',
          description: 'Referensi ketahanan dan estimasi pengiriman.',
          sourceType: 'TEXT',
          status: 'INDEXED',
          chunkCount: 2,
          uploadedById: admin.id,
        },
        {
          title: '[SEED] Dokumen menunggu index',
          description: 'Knowledge PENDING — antrian indexing.',
          sourceType: 'PDF',
          fileName: 'seed-pending.pdf',
          mimeType: 'application/pdf',
          status: 'PENDING',
          chunkCount: 0,
          uploadedById: admin.id,
        },
        {
          title: '[SEED] Dokumen gagal index',
          description: 'Knowledge FAILED — error parsing.',
          sourceType: 'PDF',
          fileName: 'seed-failed.pdf',
          mimeType: 'application/pdf',
          status: 'FAILED',
          chunkCount: 0,
          errorMessage: '[SEED] Gagal mengekstrak teks PDF (file korup / password-protected).',
          uploadedById: admin.id,
        },
      ],
    });
  }

  await prisma.userDevice.createMany({
    data: [
      {
        userId: buyer.id,
        fcmToken: 'SEED_FCM_BUYER_ANDROID',
        platform: 'ANDROID',
      },
      {
        userId: supplier.id,
        fcmToken: 'SEED_FCM_SUPPLIER_IOS',
        platform: 'IOS',
      },
    ],
  });

  await prisma.userSavedPayment.create({
    data: {
      userId: buyer.id,
      channelCode: 'BCA',
      channelName: 'BCA Virtual Account',
      channelGroup: 'BANK_TRANSFER',
      isDefault: true,
    },
  });

  logger.info('✅ [32] Supplier extras seeded.');
}
