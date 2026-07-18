import crypto from 'crypto';
import logger from '../../src/config/logger.js';

const createSignHash = (userId, partnershipId, at) =>
  crypto.createHash('sha256').update(`${userId}:${partnershipId}:${at.toISOString()}`).digest('hex');

const daysFromNow = (days) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Seed surat kontrak kerjasama buyer–supplier:
 * - PENDING (menunggu approve supplier)
 * - AWAITING_SIGNATURE (sudah diterima, menunggu e-sign)
 * - ACTIVE (sudah approve + fully signed — bukti kontrak bisa diverifikasi publik)
 * - RENEWAL_PENDING / REJECTED / EXPIRED / TERMINATED
 *
 * Demo:
 * - Buyer Hendra melihat mitra Siti & Green (ACTIVE)
 * - Supplier Siti/Green melihat pengajuan PENDING untuk di-approve
 * - Verify bukti: GET /api/v1/partnerships/verify/MITRA-SEED-ACTIVE-001
 */
export async function seedPartnerships(prisma) {
  logger.info('🌱 [23] Seeding kontrak kerjasama (PENDING / APPROVED / bukti kontrak)...');

  if (typeof prisma.buyerSupplierPartnership?.deleteMany !== 'function') {
    logger.warn(
      '⚠️ [23] BuyerSupplierPartnership belum ada di Prisma Client. Jalankan migrate + generate dulu.',
    );
    return { count: 0 };
  }

  const userIdentitySelect = {
    id: true,
    fullName: true,
    jobTitle: true,
    profile: { select: { companyName: true } },
  };
  const hendra = await prisma.user.findUnique({
    where: { email: 'h.wijaya@surabayaindustrial.com' },
    select: userIdentitySelect,
  });
  const siti = await prisma.user.findUnique({
    where: { email: 'siti.aminah@agritech.com' },
    select: userIdentitySelect,
  });
  const green = await prisma.user.findUnique({
    where: { email: 'hello@greenearth.co' },
    select: userIdentitySelect,
  });
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@bisaes.com' },
    select: { ...userIdentitySelect },
  });

  const signerOf = (user, fallbackTitle, fallbackCompany) => ({
    name: user?.fullName || 'Penandatangan',
    title: user?.jobTitle || fallbackTitle,
    company: user?.profile?.companyName || fallbackCompany || null,
  });
  const resolveBuyerSigner = async (userId) => {
    if (userId === hendra?.id) {
      return signerOf(hendra, 'Procurement Manager', 'Surabaya Industrial Hub');
    }
    const u = await prisma.user.findUnique({ where: { id: userId }, select: userIdentitySelect });
    return signerOf(u, 'Procurement Manager', u?.profile?.companyName);
  };
  const resolveSellerSigner = async (userId) => {
    if (userId === siti?.id) return signerOf(siti, 'General Manager', 'Agritech Nusantara');
    if (userId === green?.id) return signerOf(green, 'CEO', 'Green Earth Co');
    const u = await prisma.user.findUnique({ where: { id: userId }, select: userIdentitySelect });
    return signerOf(u, 'CEO', u?.profile?.companyName);
  };
  const resolvePlatformSigner = () => signerOf(admin, 'Direktur Operasional', 'BISA Agri');

  if (!hendra || !siti || !green) {
    logger.warn(
      '⚠️ [23] User demo belum lengkap. Jalankan seed users (04) dulu (hendra / siti / green).',
    );
    return { count: 0 };
  }

  const extraBuyers = await prisma.user.findMany({
    where: { role: 'BUYER', id: { not: hendra.id } },
    select: { id: true, fullName: true },
    take: 4,
  });
  const extraSuppliers = await prisma.user.findMany({
    where: { role: 'SUPPLIER', id: { notIn: [siti.id, green.id] } },
    select: { id: true, fullName: true },
    take: 3,
  });

  const b0 = extraBuyers[0];
  const b1 = extraBuyers[1];
  const b2 = extraBuyers[2];
  const b3 = extraBuyers[3];
  const s0 = extraSuppliers[0];
  const s1 = extraSuppliers[1];
  const s2 = extraSuppliers[2];

  await prisma.buyerSupplierPartnership.deleteMany({});

  const now = new Date();
  /** @type {Array<Record<string, unknown>>} */
  const seeds = [];

  // ACTIVE — Hendra ↔ Siti (fully signed)
  seeds.push({
    contractNumber: 'MITRA-SEED-ACTIVE-001',
    buyerId: hendra.id,
    supplierId: siti.id,
    tier: 'MAIN_PARTNER',
    status: 'ACTIVE',
    title: 'Mitra Utama Biochar Grade A — Surabaya Industrial',
    description:
      'Kontrak kerjasama jangka panjang pasokan biochar grade A untuk kebutuhan industri Surabaya.',
    productCategory: 'Biochar',
    estimatedMonthlyQty: 6000,
    priceAgreement: 'Rp 4.350/kg all-in, review harga tiap 6 bulan',
    deliveryTerms: 'FOB Semarang, lead time maks 5 hari kerja',
    paymentTerms: 'Net 14 hari setelah barang diterima & QC lolos',
    specialTerms: 'Minimum offtake 4 ton/bulan. Force majeure mengikuti UU NIAGA.',
    startDate: daysFromNow(-60),
    endDate: daysFromNow(305),
    initiatedBy: hendra.id,
    buyerSignedAt: daysFromNow(-60),
    sellerSignedAt: daysFromNow(-59),
    platformSignedAt: daysFromNow(-58),
    isFullySigned: true,
    renewalCount: 0,
  });

  // ACTIVE — Hendra ↔ Green
  seeds.push({
    contractNumber: 'MITRA-SEED-ACTIVE-002',
    buyerId: hendra.id,
    supplierId: green.id,
    tier: 'PREFERRED',
    status: 'ACTIVE',
    title: 'Kerjasama Organik Premium — Green Earth',
    description: 'Pasokan bahan organik premium untuk jalur retail & B2B Hendra.',
    productCategory: 'Organik',
    estimatedMonthlyQty: 2500,
    priceAgreement: 'Rp 5.100/kg volume >2 ton',
    deliveryTerms: 'Door-to-door Surabaya, asuransi full',
    paymentTerms: 'Net 7 hari',
    specialTerms: 'Sertifikat organik wajib dilampirkan tiap batch.',
    startDate: daysFromNow(-30),
    endDate: daysFromNow(335),
    initiatedBy: hendra.id,
    buyerSignedAt: daysFromNow(-30),
    sellerSignedAt: daysFromNow(-29),
    platformSignedAt: daysFromNow(-28),
    isFullySigned: true,
    renewalCount: 1,
  });

  // PENDING — menunggu approve (Hendra → supplier ekstra, atau buyer ekstra → Siti)
  if (s0) {
    seeds.push({
      contractNumber: 'MITRA-SEED-PENDING-001',
      buyerId: hendra.id,
      supplierId: s0.id,
      tier: 'STANDARD',
      status: 'PENDING',
      title: 'Pengajuan Mitra Sekam Padi — Menunggu Persetujuan',
      description: 'Surat pengajuan kerjasama baru. Supplier belum menyetujui proposal ini.',
      productCategory: 'Sekam Padi',
      estimatedMonthlyQty: 1500,
      priceAgreement: 'Negosiasi awal Rp 2.800/kg',
      deliveryTerms: 'Pickup gudang supplier',
      paymentTerms: 'COD / transfer setelah QC',
      specialTerms: 'Trial 1 bulan sebelum perpanjang.',
      startDate: daysFromNow(7),
      endDate: daysFromNow(187),
      initiatedBy: hendra.id,
      buyerSignedAt: now,
      sellerSignedAt: null,
      isFullySigned: false,
      renewalCount: 0,
    });
  } else if (b0) {
    seeds.push({
      contractNumber: 'MITRA-SEED-PENDING-001',
      buyerId: b0.id,
      supplierId: siti.id,
      tier: 'STANDARD',
      status: 'PENDING',
      title: 'Pengajuan Mitra Biochar — Menunggu Persetujuan Supplier',
      description: 'Proposal kerjasama menunggu approve Siti Aminah (Agritech).',
      productCategory: 'Biochar',
      estimatedMonthlyQty: 1200,
      priceAgreement: 'Rp 4.200/kg',
      deliveryTerms: 'FOB Serpong',
      paymentTerms: 'Net 14',
      specialTerms: null,
      startDate: daysFromNow(3),
      endDate: daysFromNow(180),
      initiatedBy: b0.id,
      buyerSignedAt: now,
      sellerSignedAt: null,
      isFullySigned: false,
      renewalCount: 0,
    });
  }

  // PENDING — ke Green
  if (b0) {
    seeds.push({
      contractNumber: 'MITRA-SEED-PENDING-002',
      buyerId: b0.id,
      supplierId: green.id,
      tier: 'PREFERRED',
      status: 'PENDING',
      title: 'Pengajuan Kerjasama Organik — Belum Di-approve',
      description: 'Masih tahap pengajuan; supplier belum accept.',
      productCategory: 'Organik',
      estimatedMonthlyQty: 800,
      priceAgreement: 'Rp 4.900/kg',
      deliveryTerms: 'Kirim mingguan',
      paymentTerms: 'Net 10',
      specialTerms: 'Sample 200kg di awal kontrak.',
      startDate: daysFromNow(14),
      endDate: daysFromNow(200),
      initiatedBy: b0.id,
      buyerSignedAt: daysFromNow(-1),
      sellerSignedAt: null,
      isFullySigned: false,
      renewalCount: 0,
    });
  }

  // AWAITING_SIGNATURE — buyer+supplier sudah TTD, menunggu penengah BISA
  if (b1) {
    seeds.push({
      contractNumber: 'MITRA-SEED-AWAIT-SIGN-001',
      buyerId: b1.id,
      supplierId: siti.id,
      tier: 'STANDARD',
      status: 'AWAITING_SIGNATURE',
      title: 'Kontrak 2/3 TTD — Menunggu Penengah BISA',
      description:
        'Buyer dan supplier sudah menandatangani. Menunggu tanda tangan penengah BISA agar kontrak aktif.',
      productCategory: 'Biochar',
      estimatedMonthlyQty: 2000,
      priceAgreement: 'Rp 4.400/kg',
      deliveryTerms: 'FOB',
      paymentTerms: 'Net 14',
      specialTerms: null,
      startDate: daysFromNow(5),
      endDate: daysFromNow(370),
      initiatedBy: b1.id,
      buyerSignedAt: daysFromNow(-3),
      sellerSignedAt: daysFromNow(-2),
      platformSignedAt: null,
      isFullySigned: false,
      renewalCount: 0,
    });
  }

  // REJECTED
  if (b2) {
    seeds.push({
      contractNumber: 'MITRA-SEED-REJECTED-001',
      buyerId: b2.id,
      supplierId: green.id,
      tier: 'STANDARD',
      status: 'REJECTED',
      title: 'Pengajuan Ditolak — Kapasitas Penuh',
      description: 'Proposal ditolak supplier karena kapasitas produksi penuh Q3.',
      productCategory: 'Organik',
      estimatedMonthlyQty: 5000,
      priceAgreement: 'Rp 4.500/kg',
      deliveryTerms: 'FOB Jakarta',
      paymentTerms: 'Net 30',
      specialTerms: null,
      startDate: daysFromNow(30),
      endDate: daysFromNow(210),
      initiatedBy: b2.id,
      buyerSignedAt: daysFromNow(-10),
      sellerSignedAt: null,
      isFullySigned: false,
      rejectionReason: 'Kapasitas produksi Q3 sudah penuh. Silakan ajukan ulang bulan depan.',
      renewalCount: 0,
    });
  }

  // RENEWAL / EXPIRED / TERMINATED: pastikan juga punya 3 TTD jika fully signed
  if (b3 && s1) {
    seeds.push({
      contractNumber: 'MITRA-SEED-RENEWAL-001',
      buyerId: b3.id,
      supplierId: s1.id,
      tier: 'MAIN_PARTNER',
      status: 'RENEWAL_PENDING',
      title: 'Perpanjangan Kontrak Mitra Utama — Menunggu Approve',
      description: 'Pengajuan perpanjangan masa kontrak 12 bulan.',
      productCategory: 'Biochar',
      estimatedMonthlyQty: 4000,
      priceAgreement: 'Lanjutkan harga lama +2%',
      deliveryTerms: 'Sama seperti kontrak sebelumnya',
      paymentTerms: 'Net 14',
      specialTerms: 'Auto-renew sekali jika kedua pihak setuju.',
      startDate: daysFromNow(-340),
      endDate: daysFromNow(25),
      initiatedBy: b3.id,
      buyerSignedAt: daysFromNow(-340),
      sellerSignedAt: daysFromNow(-339),
      platformSignedAt: daysFromNow(-338),
      isFullySigned: true,
      renewalCount: 1,
      renewalProposedEndDate: daysFromNow(390),
      renewalRequestedBy: b3.id,
      renewalRequestedAt: daysFromNow(-2),
      renewalNote: 'Mohon perpanjang 12 bulan dengan syarat yang sama.',
    });
  }

  if (b1 && s2) {
    seeds.push({
      contractNumber: 'MITRA-SEED-EXPIRED-001',
      buyerId: b1.id,
      supplierId: s2.id,
      tier: 'STANDARD',
      status: 'EXPIRED',
      title: 'Kontrak Habis Masa Berlaku',
      description: 'Kontrak sudah lewat endDate — bisa diajukan renew.',
      productCategory: 'Tempurung Kelapa',
      estimatedMonthlyQty: 1000,
      priceAgreement: 'Rp 3.600/kg',
      deliveryTerms: 'FOB',
      paymentTerms: 'Net 14',
      specialTerms: null,
      startDate: daysFromNow(-400),
      endDate: daysFromNow(-15),
      initiatedBy: b1.id,
      buyerSignedAt: daysFromNow(-400),
      sellerSignedAt: daysFromNow(-399),
      platformSignedAt: daysFromNow(-398),
      isFullySigned: true,
      renewalCount: 0,
    });
  }

  if (b0 && s2) {
    seeds.push({
      contractNumber: 'MITRA-SEED-TERMINATED-001',
      buyerId: b0.id,
      supplierId: s2.id,
      tier: 'STANDARD',
      status: 'TERMINATED',
      title: 'Kontrak Dihentikan Sepakat',
      description: 'Kerjasama dihentikan atas kesepakatan kedua pihak.',
      productCategory: 'Tongkol Jagung',
      estimatedMonthlyQty: 900,
      priceAgreement: 'Rp 2.400/kg',
      deliveryTerms: 'Pickup',
      paymentTerms: 'COD',
      specialTerms: null,
      startDate: daysFromNow(-120),
      endDate: daysFromNow(60),
      initiatedBy: b0.id,
      buyerSignedAt: daysFromNow(-120),
      sellerSignedAt: daysFromNow(-119),
      platformSignedAt: daysFromNow(-118),
      isFullySigned: true,
      terminatedAt: daysFromNow(-10),
      terminatedBy: b0.id,
      renewalCount: 0,
    });
  }

  let created = 0;
  for (const seed of seeds) {
    const buyerSignAt = seed.buyerSignedAt || null;
    const sellerSignAt = seed.sellerSignedAt || null;
    const platformSignAt = seed.platformSignedAt || null;
    const draftId = seed.contractNumber;
    const platformSignerId =
      platformSignAt && admin ? admin.id : null;

    const buyerSigner = buyerSignAt ? await resolveBuyerSigner(seed.buyerId) : null;
    const sellerSigner = sellerSignAt ? await resolveSellerSigner(seed.supplierId) : null;
    const platformSigner = platformSignAt ? resolvePlatformSigner() : null;

    const row = await prisma.buyerSupplierPartnership.create({
      data: {
        contractNumber: seed.contractNumber,
        buyerId: seed.buyerId,
        supplierId: seed.supplierId,
        tier: seed.tier,
        status: seed.status,
        title: seed.title,
        description: seed.description,
        productCategory: seed.productCategory,
        estimatedMonthlyQty: seed.estimatedMonthlyQty,
        priceAgreement: seed.priceAgreement,
        deliveryTerms: seed.deliveryTerms,
        paymentTerms: seed.paymentTerms,
        specialTerms: seed.specialTerms,
        startDate: seed.startDate,
        endDate: seed.endDate,
        initiatedBy: seed.initiatedBy,
        buyerSignedAt: buyerSignAt,
        sellerSignedAt: sellerSignAt,
        platformSignedAt: platformSignAt,
        buyerSignHash: buyerSignAt ? createSignHash(seed.buyerId, draftId, buyerSignAt) : null,
        sellerSignHash: sellerSignAt
          ? createSignHash(seed.supplierId, draftId, sellerSignAt)
          : null,
        platformSignHash:
          platformSignAt && platformSignerId
            ? createSignHash(platformSignerId, draftId, platformSignAt)
            : null,
        platformSignerId,
        buyerSignerName: buyerSigner?.name ?? null,
        buyerSignerTitle: buyerSigner?.title ?? null,
        buyerCompanyName: buyerSigner?.company ?? null,
        sellerSignerName: sellerSigner?.name ?? null,
        sellerSignerTitle: sellerSigner?.title ?? null,
        sellerCompanyName: sellerSigner?.company ?? null,
        platformSignerName: platformSigner?.name ?? null,
        platformSignerTitle: platformSigner?.title ?? null,
        isFullySigned: seed.isFullySigned,
        rejectionReason: seed.rejectionReason ?? null,
        terminatedAt: seed.terminatedAt ?? null,
        terminatedBy: seed.terminatedBy ?? null,
        renewalCount: seed.renewalCount ?? 0,
        renewalProposedEndDate: seed.renewalProposedEndDate ?? null,
        renewalRequestedBy: seed.renewalRequestedBy ?? null,
        renewalRequestedAt: seed.renewalRequestedAt ?? null,
        renewalNote: seed.renewalNote ?? null,
      },
    });

    await prisma.buyerSupplierPartnership.update({
      where: { id: row.id },
      data: {
        buyerSignHash: buyerSignAt ? createSignHash(seed.buyerId, row.id, buyerSignAt) : null,
        sellerSignHash: sellerSignAt
          ? createSignHash(seed.supplierId, row.id, sellerSignAt)
          : null,
        platformSignHash:
          platformSignAt && platformSignerId
            ? createSignHash(platformSignerId, row.id, platformSignAt)
            : null,
      },
    });

    created += 1;
    logger.info(`   ✓ ${seed.contractNumber} [${seed.status}] — ${seed.title}`);
  }

  if (typeof prisma.notification?.createMany === 'function') {
    const notifData = [
      {
        userId: siti.id,
        title: 'Pengajuan Mitra Baru',
        body: 'Ada pengajuan surat kontrak kerjasama yang menunggu persetujuan Anda.',
        type: 'PARTNERSHIP',
        priority: 'HIGH',
      },
      {
        userId: hendra.id,
        title: 'Kontrak Mitra Aktif',
        body: 'Kontrak MITRA-SEED-ACTIVE-001 dengan Agritech sudah fully signed. Bukti bisa diverifikasi publik.',
        type: 'PARTNERSHIP',
        priority: 'MEDIUM',
      },
      {
        userId: green.id,
        title: 'Kerjasama Preferred Aktif',
        body: 'Kontrak MITRA-SEED-ACTIVE-002 dengan Surabaya Industrial Hub sudah aktif.',
        type: 'PARTNERSHIP',
        priority: 'MEDIUM',
      },
    ];
    if (admin) {
      notifData.push({
        userId: admin.id,
        title: 'Seed Partnerships',
        body: `${created} kontrak kerjasama demo telah di-seed.`,
        type: 'SYSTEM_ANNOUNCEMENT',
        priority: 'LOW',
      });
    }
    await prisma.notification.createMany({ data: notifData });
  }

  logger.info(
    `✅ [23] ${created} kontrak kerjasama di-seed (TTD 3 pihak: Buyer + Supplier + Penengah BISA).`,
  );
  logger.info(
    '   ACTIVE = 3/3 TTD. AWAIT-SIGN = 2/3 (menunggu BISA). Verify: GET /api/v1/partnerships/verify/MITRA-SEED-ACTIVE-001',
  );
  return { count: created };
}
