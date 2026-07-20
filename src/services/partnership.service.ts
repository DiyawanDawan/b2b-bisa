import crypto from 'crypto';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import * as storageService from '#services/storage.service';
import { createNotification } from '#services/notification.service';
import { NotificationType, PartnershipStatus, PartnershipTier, Prisma, UserRole } from '#prisma';

const userSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  province: true,
  regency: true,
  verification: { select: { isVerified: true } },
  profile: { select: { companyName: true, businessType: true } },
};

const mapUser = (user: {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  province: string | null;
  regency: string | null;
  verification?: { isVerified: boolean } | null;
  profile?: { companyName: string | null; businessType: string | null } | null;
}) => ({
  id: user.id,
  fullName: user.fullName,
  avatarUrl: user.avatarUrl ? storageService.getPublicUrl(user.avatarUrl) : null,
  role: user.role,
  province: user.province,
  regency: user.regency,
  isVerified: user.verification?.isVerified ?? false,
  companyName: user.profile?.companyName ?? null,
  businessType: user.profile?.businessType ?? null,
});

const generateContractNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `MITRA-${date}-${hex}`;
};

const createSignHash = (userId: string, partnershipId: string, at: Date) =>
  crypto
    .createHash('sha256')
    .update(`${userId}:${partnershipId}:${at.toISOString()}`)
    .digest('hex');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const daysUntil = (endDate: Date) => {
  const ms = endOfDay(endDate).getTime() - startOfToday().getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

/** Tandai kontrak ACTIVE yang sudah lewat endDate menjadi EXPIRED. */
export const expireDuePartnerships = async () => {
  const today = startOfToday();
  await prisma.buyerSupplierPartnership.updateMany({
    where: {
      status: PartnershipStatus.ACTIVE,
      endDate: { lt: today },
    },
    data: { status: PartnershipStatus.EXPIRED },
  });
};

const computeContractMeta = (row: {
  status: PartnershipStatus;
  startDate: Date;
  endDate: Date;
  renewalProposedEndDate: Date | null;
  renewalRequestedBy: string | null;
}) => {
  const today = startOfToday();
  const daysLeft = daysUntil(row.endDate);
  const hasStarted = row.startDate <= endOfDay(today);
  const isExpiredByDate = row.endDate < today;
  const isExpiringSoon = row.status === PartnershipStatus.ACTIVE && daysLeft >= 0 && daysLeft <= 30;

  let contractPhase: 'UPCOMING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'OTHER' = 'OTHER';
  if (row.status === PartnershipStatus.EXPIRED || isExpiredByDate) {
    contractPhase = 'EXPIRED';
  } else if (row.status === PartnershipStatus.ACTIVE && !hasStarted) {
    contractPhase = 'UPCOMING';
  } else if (isExpiringSoon) {
    contractPhase = 'EXPIRING_SOON';
  } else if (row.status === PartnershipStatus.ACTIVE) {
    contractPhase = 'ACTIVE';
  }

  const canRenew =
    row.status === PartnershipStatus.EXPIRED ||
    (row.status === PartnershipStatus.ACTIVE && isExpiringSoon) ||
    (row.status === PartnershipStatus.ACTIVE && isExpiredByDate);

  return {
    daysUntilExpiry: daysLeft,
    contractPhase,
    canRenew: canRenew && row.status !== PartnershipStatus.RENEWAL_PENDING,
    isRenewalPending: row.status === PartnershipStatus.RENEWAL_PENDING,
    renewalProposedEndDate: row.renewalProposedEndDate,
    renewalRequestedBy: row.renewalRequestedBy,
  };
};

const mapPartnership = (row: {
  id: string;
  contractNumber: string;
  buyerId: string;
  supplierId: string;
  tier: PartnershipTier;
  status: PartnershipStatus;
  title: string;
  description: string | null;
  productCategory: string | null;
  estimatedMonthlyQty: Prisma.Decimal | null;
  priceAgreement: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  specialTerms: string | null;
  startDate: Date;
  endDate: Date;
  buyerSignedAt: Date | null;
  sellerSignedAt: Date | null;
  platformSignedAt?: Date | null;
  buyerSignerName?: string | null;
  buyerSignerTitle?: string | null;
  buyerCompanyName?: string | null;
  sellerSignerName?: string | null;
  sellerSignerTitle?: string | null;
  sellerCompanyName?: string | null;
  platformSignerName?: string | null;
  platformSignerTitle?: string | null;
  isFullySigned: boolean;
  rejectionReason: string | null;
  terminatedAt: Date | null;
  terminatedBy: string | null;
  renewalCount: number;
  renewalProposedEndDate: Date | null;
  renewalRequestedBy: string | null;
  renewalRequestedAt: Date | null;
  renewalNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  buyer: Parameters<typeof mapUser>[0];
  supplier: Parameters<typeof mapUser>[0];
}) => {
  const meta = computeContractMeta(row);
  const signers = {
    buyer: Boolean(row.buyerSignedAt),
    supplier: Boolean(row.sellerSignedAt),
    platform: Boolean(row.platformSignedAt),
  };
  const signedCount = [signers.buyer, signers.supplier, signers.platform].filter(Boolean).length;
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    buyerId: row.buyerId,
    supplierId: row.supplierId,
    tier: row.tier,
    status: row.status,
    title: row.title,
    description: row.description,
    productCategory: row.productCategory,
    estimatedMonthlyQty: row.estimatedMonthlyQty ? Number(row.estimatedMonthlyQty) : null,
    priceAgreement: row.priceAgreement,
    deliveryTerms: row.deliveryTerms,
    paymentTerms: row.paymentTerms,
    specialTerms: row.specialTerms,
    startDate: row.startDate,
    endDate: row.endDate,
    buyerSignedAt: row.buyerSignedAt,
    sellerSignedAt: row.sellerSignedAt,
    platformSignedAt: row.platformSignedAt ?? null,
    buyerSignerName: row.buyerSignerName ?? null,
    buyerSignerTitle: row.buyerSignerTitle ?? null,
    buyerCompanyName: row.buyerCompanyName ?? null,
    sellerSignerName: row.sellerSignerName ?? null,
    sellerSignerTitle: row.sellerSignerTitle ?? null,
    sellerCompanyName: row.sellerCompanyName ?? null,
    platformSignerName: row.platformSignerName ?? null,
    platformSignerTitle: row.platformSignerTitle ?? null,
    isFullySigned: row.isFullySigned,
    /** Kontrak kerjasama BISA = 3 pihak: Buyer, Supplier, Penengah (BISA). */
    requiredSigners: 3,
    signedCount,
    signers,
    signatures: [
      {
        party: 'BUYER',
        label: 'Buyer',
        signedAt: row.buyerSignedAt,
        signerName: row.buyerSignerName ?? row.buyer.fullName,
        signerTitle: row.buyerSignerTitle ?? null,
        companyName: row.buyerCompanyName ?? row.buyer.profile?.companyName ?? null,
      },
      {
        party: 'SUPPLIER',
        label: 'Supplier',
        signedAt: row.sellerSignedAt,
        signerName: row.sellerSignerName ?? row.supplier.fullName,
        signerTitle: row.sellerSignerTitle ?? null,
        companyName: row.sellerCompanyName ?? row.supplier.profile?.companyName ?? null,
      },
      {
        party: 'PLATFORM',
        label: 'Penengah BISA',
        signedAt: row.platformSignedAt ?? null,
        signerName: row.platformSignerName ?? 'BISA Agri',
        signerTitle: row.platformSignerTitle ?? null,
        companyName: 'BISA Agri',
      },
    ],
    rejectionReason: row.rejectionReason,
    terminatedAt: row.terminatedAt,
    terminatedBy: row.terminatedBy,
    renewalCount: row.renewalCount,
    renewalProposedEndDate: row.renewalProposedEndDate,
    renewalRequestedBy: row.renewalRequestedBy,
    renewalRequestedAt: row.renewalRequestedAt,
    renewalNote: row.renewalNote,
    daysUntilExpiry: meta.daysUntilExpiry,
    contractPhase: meta.contractPhase,
    canRenew: meta.canRenew,
    isRenewalPending: meta.isRenewalPending,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    buyer: mapUser(row.buyer),
    supplier: mapUser(row.supplier),
  };
};

const isTripleSigned = (parts: {
  buyerSignedAt: Date | null | undefined;
  sellerSignedAt: Date | null | undefined;
  platformSignedAt: Date | null | undefined;
}) => Boolean(parts.buyerSignedAt && parts.sellerSignedAt && parts.platformSignedAt);

const resolveSignerIdentity = async (
  userId: string,
  overrides?: { signerName?: string; signerTitle?: string; companyName?: string },
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      jobTitle: true,
      role: true,
      profile: { select: { companyName: true } },
    },
  });
  const defaultPlatformTitle = 'General Manager';
  const defaultTitle =
    user?.role === UserRole.ADMIN
      ? defaultPlatformTitle
      : user?.jobTitle || (user?.role === UserRole.BUYER ? 'Procurement Manager' : 'CEO');

  return {
    signerName: overrides?.signerName?.trim() || user?.fullName || 'Penandatangan',
    signerTitle: overrides?.signerTitle?.trim() || defaultTitle,
    companyName:
      overrides?.companyName?.trim() ||
      user?.profile?.companyName ||
      (user?.role === UserRole.ADMIN ? 'BISA Agri' : null),
  };
};

const partnershipInclude = {
  buyer: { select: userSelect },
  supplier: { select: userSelect },
} as const;

const assertParticipant = async (partnershipId: string, userId: string, allowAdmin = false) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: { id: true, buyerId: true, supplierId: true },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  const isParty = row.buyerId === userId || row.supplierId === userId;
  if (!isParty && !allowAdmin) {
    throw new AppError('Anda tidak berhak mengakses kontrak ini.', 403);
  }
  return row;
};

const assertNoActivePartnership = async (buyerId: string, supplierId: string) => {
  const existing = await prisma.buyerSupplierPartnership.findFirst({
    where: {
      buyerId,
      supplierId,
      status: {
        in: [
          PartnershipStatus.PENDING,
          PartnershipStatus.AWAITING_SIGNATURE,
          PartnershipStatus.ACTIVE,
          PartnershipStatus.RENEWAL_PENDING,
        ],
      },
    },
    select: { id: true, status: true, contractNumber: true },
  });
  if (existing) {
    throw new AppError(
      `Sudah ada kerjasama aktif atau dalam proses (${existing.contractNumber}).`,
      409,
    );
  }
};

export const createPartnership = async (
  buyerId: string,
  input: {
    supplierId: string;
    title: string;
    description?: string;
    productCategory?: string;
    estimatedMonthlyQty?: number;
    priceAgreement?: string;
    deliveryTerms?: string;
    paymentTerms?: string;
    specialTerms?: string;
    startDate: Date;
    endDate: Date;
    tier?: PartnershipTier;
    originatingNegotiationId?: string;
    originatingOrderId?: string;
    signerName?: string;
    signerTitle?: string;
  },
) => {
  if (buyerId === input.supplierId) {
    throw new AppError('Tidak bisa menjalin kerjasama dengan akun sendiri.', 400);
  }

  const supplier = await prisma.user.findUnique({
    where: { id: input.supplierId },
    select: { id: true, role: true, fullName: true },
  });
  if (!supplier) throw new AppError('Supplier tidak ditemukan.', 404);
  if (supplier.role !== UserRole.SUPPLIER) {
    throw new AppError('User yang dipilih bukan supplier.', 400);
  }

  if (input.endDate <= input.startDate) {
    throw new AppError('Tanggal berakhir harus setelah tanggal mulai.', 400);
  }

  const minDuration = 30;
  const durationMs = input.endDate.getTime() - input.startDate.getTime();
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  if (durationDays < minDuration) {
    throw new AppError(`Masa kontrak minimal ${minDuration} hari.`, 400);
  }

  await assertNoActivePartnership(buyerId, input.supplierId);

  const now = new Date();
  const buyerSignHash = createSignHash(buyerId, 'draft', now);
  const buyerIdentity = await resolveSignerIdentity(buyerId, {
    signerName: input.signerName,
    signerTitle: input.signerTitle,
  });

  const created = await prisma.buyerSupplierPartnership.create({
    data: {
      contractNumber: generateContractNumber(),
      buyerId,
      supplierId: input.supplierId,
      tier: input.tier ?? PartnershipTier.MAIN_PARTNER,
      status: PartnershipStatus.PENDING,
      title: input.title,
      description: input.description,
      productCategory: input.productCategory,
      estimatedMonthlyQty: input.estimatedMonthlyQty,
      priceAgreement: input.priceAgreement,
      deliveryTerms: input.deliveryTerms,
      paymentTerms: input.paymentTerms,
      specialTerms: input.specialTerms,
      startDate: input.startDate,
      endDate: input.endDate,
      initiatedBy: buyerId,
      originatingNegotiationId: input.originatingNegotiationId,
      originatingOrderId: input.originatingOrderId,
      buyerSignedAt: now,
      buyerSignHash,
      buyerSignerName: buyerIdentity.signerName,
      buyerSignerTitle: buyerIdentity.signerTitle,
      buyerCompanyName: buyerIdentity.companyName,
    },
    include: partnershipInclude,
  });

  const finalHash = createSignHash(buyerId, created.id, now);
  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: created.id },
    data: { buyerSignHash: finalHash },
    include: partnershipInclude,
  });

  void createNotification({
    userId: input.supplierId,
    title: 'Proposal Mitra Utama',
    body: `Buyer mengajukan kontrak kerjasama: ${input.title}`,
    type: NotificationType.PARTNERSHIP,
    refId: updated.id,
  });

  return mapPartnership(updated);
};

export const listMyPartnerships = async (
  userId: string,
  role: UserRole,
  page = 1,
  limit = 20,
  status?: PartnershipStatus,
  search?: string,
) => {
  await expireDuePartnerships();

  const skip = (page - 1) * limit;
  // Admin (penengah BISA) melihat semua kontrak — terutama yang menunggu TTD platform
  const where: Prisma.BuyerSupplierPartnershipWhereInput =
    role === UserRole.ADMIN
      ? {}
      : role === UserRole.SUPPLIER
        ? { supplierId: userId }
        : { buyerId: userId };
  if (status) where.status = status;

  const keyword = search?.trim();
  if (keyword && role === UserRole.ADMIN) {
    where.OR = [
      { contractNumber: { contains: keyword, mode: 'insensitive' } },
      { title: { contains: keyword, mode: 'insensitive' } },
      { buyer: { fullName: { contains: keyword, mode: 'insensitive' } } },
      { supplier: { fullName: { contains: keyword, mode: 'insensitive' } } },
      { buyer: { profile: { companyName: { contains: keyword, mode: 'insensitive' } } } },
      { supplier: { profile: { companyName: { contains: keyword, mode: 'insensitive' } } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.buyerSupplierPartnership.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: partnershipInclude,
    }),
    prisma.buyerSupplierPartnership.count({ where }),
  ]);

  return {
    partnerships: rows.map(mapPartnership),
    total,
    page,
    limit,
  };
};

/** Daftar kontrak untuk admin panel (filter aksi / TTD). */
export const listAdminPartnerships = async (params: {
  page?: number;
  limit?: number;
  status?: PartnershipStatus;
  search?: string;
  filter?: 'all' | 'needs_action' | 'needs_platform_sign' | 'draft_pending';
}) => {
  await expireDuePartnerships();

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;
  const filter = params.filter ?? 'needs_action';

  const where: Prisma.BuyerSupplierPartnershipWhereInput = {};

  if (params.status) {
    where.status = params.status;
  } else if (filter === 'needs_action') {
    where.status = {
      in: [
        PartnershipStatus.PENDING,
        PartnershipStatus.AWAITING_SIGNATURE,
        PartnershipStatus.RENEWAL_PENDING,
      ],
    };
  } else if (filter === 'draft_pending') {
    where.status = PartnershipStatus.PENDING;
  } else if (filter === 'needs_platform_sign') {
    where.status = {
      in: [PartnershipStatus.PENDING, PartnershipStatus.AWAITING_SIGNATURE],
    };
    where.buyerSignedAt = { not: null };
    where.sellerSignedAt = { not: null };
    where.platformSignedAt = null;
  }

  const keyword = params.search?.trim();
  if (keyword) {
    where.OR = [
      { contractNumber: { contains: keyword, mode: 'insensitive' } },
      { title: { contains: keyword, mode: 'insensitive' } },
      { buyer: { fullName: { contains: keyword, mode: 'insensitive' } } },
      { supplier: { fullName: { contains: keyword, mode: 'insensitive' } } },
      { buyer: { profile: { companyName: { contains: keyword, mode: 'insensitive' } } } },
      { supplier: { profile: { companyName: { contains: keyword, mode: 'insensitive' } } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.buyerSupplierPartnership.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: partnershipInclude,
    }),
    prisma.buyerSupplierPartnership.count({ where }),
  ]);

  const partnerships = rows.map(mapPartnership).map((p) => ({
    ...p,
    needsPlatformSign: Boolean(
      p.buyerSignedAt && p.sellerSignedAt && !p.platformSignedAt && !p.isFullySigned,
    ),
    signatureLabel: `${p.signedCount}/${p.requiredSigners} TTD`,
  }));

  return { partnerships, total, page, limit };
};

export const getPartnershipById = async (
  partnershipId: string,
  userId: string,
  role?: UserRole,
) => {
  await expireDuePartnerships();
  const isAdmin = role === UserRole.ADMIN;
  await assertParticipant(partnershipId, userId, isAdmin);
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    include: partnershipInclude,
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  return mapPartnership(row);
};

export const checkPartnershipWithSupplier = async (buyerId: string, supplierId: string) => {
  await expireDuePartnerships();

  const row = await prisma.buyerSupplierPartnership.findFirst({
    where: {
      buyerId,
      supplierId,
      status: {
        in: [
          PartnershipStatus.PENDING,
          PartnershipStatus.AWAITING_SIGNATURE,
          PartnershipStatus.ACTIVE,
          PartnershipStatus.RENEWAL_PENDING,
          PartnershipStatus.EXPIRED,
        ],
      },
    },
    include: partnershipInclude,
    orderBy: { updatedAt: 'desc' },
  });

  if (!row) {
    return { hasPartnership: false, partnership: null, canCreateNew: true };
  }

  const mapped = mapPartnership(row);
  return {
    hasPartnership: row.status !== PartnershipStatus.EXPIRED,
    partnership: mapped,
    canCreateNew: row.status === PartnershipStatus.EXPIRED && !mapped.isRenewalPending,
    canRenew: mapped.canRenew || mapped.isRenewalPending,
  };
};

export const acceptPartnership = async (partnershipId: string, supplierId: string) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    include: { buyer: { select: { id: true, fullName: true } } },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  if (row.supplierId !== supplierId) {
    throw new AppError('Hanya supplier yang dapat menerima proposal ini.', 403);
  }
  if (row.status !== PartnershipStatus.PENDING) {
    throw new AppError('Proposal sudah diproses sebelumnya.', 400);
  }

  const now = new Date();
  const sellerSignHash = createSignHash(supplierId, partnershipId, now);
  const sellerIdentity = await resolveSignerIdentity(supplierId);
  // Setelah supplier approve: masih butuh TTD BISA (penengah) → belum ACTIVE
  const nextStatus = PartnershipStatus.AWAITING_SIGNATURE;

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: nextStatus,
      sellerSignedAt: now,
      sellerSignHash,
      sellerSignerName: sellerIdentity.signerName,
      sellerSignerTitle: sellerIdentity.signerTitle,
      sellerCompanyName: sellerIdentity.companyName,
      isFullySigned: false,
    },
    include: partnershipInclude,
  });

  void createNotification({
    userId: row.buyerId,
    title: 'Kerjasama Diterima',
    body: `Supplier menerima kontrak kerjasama "${row.title}". Menunggu tanda tangan penengah BISA.`,
    type: NotificationType.PARTNERSHIP,
    refId: partnershipId,
  });

  return mapPartnership(updated);
};

export const rejectPartnership = async (
  partnershipId: string,
  supplierId: string,
  reason: string,
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: { id: true, supplierId: true, buyerId: true, status: true, title: true },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  if (row.supplierId !== supplierId) {
    throw new AppError('Hanya supplier yang dapat menolak proposal ini.', 403);
  }
  if (row.status !== PartnershipStatus.PENDING) {
    throw new AppError('Proposal sudah diproses sebelumnya.', 400);
  }

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: PartnershipStatus.REJECTED,
      rejectionReason: reason,
    },
    include: partnershipInclude,
  });

  void createNotification({
    userId: row.buyerId,
    title: 'Kerjasama Ditolak',
    body: `Supplier menolak kontrak "${row.title}".`,
    type: NotificationType.PARTNERSHIP,
    refId: partnershipId,
  });

  return mapPartnership(updated);
};

export const signPartnership = async (
  partnershipId: string,
  userId: string,
  role?: UserRole,
  input?: { signerName?: string; signerTitle?: string },
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: {
      id: true,
      buyerId: true,
      supplierId: true,
      status: true,
      title: true,
      endDate: true,
      buyerSignedAt: true,
      sellerSignedAt: true,
      platformSignedAt: true,
      isFullySigned: true,
    },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);

  const isBuyer = row.buyerId === userId;
  const isSeller = row.supplierId === userId;
  const isPlatform = role === UserRole.ADMIN;
  if (!isBuyer && !isSeller && !isPlatform) {
    throw new AppError('Anda tidak berhak menandatangani kontrak ini.', 403);
  }

  if (![PartnershipStatus.PENDING, PartnershipStatus.AWAITING_SIGNATURE].includes(row.status)) {
    throw new AppError('Kontrak tidak dalam status penandatanganan.', 400);
  }

  // Penengah BISA hanya boleh tanda tangan setelah buyer & supplier sudah TTD / accept
  if (isPlatform && (!row.buyerSignedAt || !row.sellerSignedAt)) {
    throw new AppError(
      'Penengah BISA hanya dapat menandatangani setelah buyer dan supplier menandatangani.',
      400,
    );
  }

  const now = new Date();
  const signHash = createSignHash(userId, partnershipId, now);
  const identity = await resolveSignerIdentity(userId, {
    signerName: input?.signerName,
    signerTitle: input?.signerTitle,
  });
  const data: Prisma.BuyerSupplierPartnershipUpdateInput = {};

  if (isBuyer && !row.buyerSignedAt) {
    data.buyerSignedAt = now;
    data.buyerSignHash = signHash;
    data.buyerSignerName = identity.signerName;
    data.buyerSignerTitle = identity.signerTitle;
    data.buyerCompanyName = identity.companyName;
  } else if (isSeller && !row.sellerSignedAt) {
    data.sellerSignedAt = now;
    data.sellerSignHash = signHash;
    data.sellerSignerName = identity.signerName;
    data.sellerSignerTitle = identity.signerTitle;
    data.sellerCompanyName = identity.companyName;
  } else if (isPlatform && !row.platformSignedAt) {
    data.platformSignedAt = now;
    data.platformSignHash = signHash;
    data.platformSignerId = userId;
    data.platformSignerName = identity.signerName;
    data.platformSignerTitle = identity.signerTitle;
  } else {
    throw new AppError('Kontrak sudah Anda tandatangani.', 400);
  }

  const buyerWillSign = isBuyer ? now : row.buyerSignedAt;
  const sellerWillSign = isSeller ? now : row.sellerSignedAt;
  const platformWillSign = isPlatform ? now : row.platformSignedAt;

  if (
    isTripleSigned({
      buyerSignedAt: buyerWillSign,
      sellerSignedAt: sellerWillSign,
      platformSignedAt: platformWillSign,
    })
  ) {
    data.isFullySigned = true;
    data.status =
      row.endDate >= startOfToday() ? PartnershipStatus.ACTIVE : PartnershipStatus.EXPIRED;
  } else {
    data.isFullySigned = false;
    data.status = PartnershipStatus.AWAITING_SIGNATURE;
  }

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data,
    include: partnershipInclude,
  });

  const notifyIds = new Set<string>([row.buyerId, row.supplierId]);
  notifyIds.delete(userId);
  const signerLabel = isPlatform ? 'Penengah BISA' : isBuyer ? 'Buyer' : 'Supplier';
  for (const notifyUserId of notifyIds) {
    void createNotification({
      userId: notifyUserId,
      title: 'Kontrak Ditandatangani',
      body: `${signerLabel} menandatangani kontrak "${row.title}" (${updated.isFullySigned ? 'lengkap 3/3' : 'menunggu TTD lain'}).`,
      type: NotificationType.PARTNERSHIP,
      refId: partnershipId,
    });
  }

  return mapPartnership(updated);
};

export const terminatePartnership = async (
  partnershipId: string,
  userId: string,
  reason?: string,
) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: {
      id: true,
      buyerId: true,
      supplierId: true,
      status: true,
      title: true,
    },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  if (row.buyerId !== userId && row.supplierId !== userId) {
    throw new AppError('Anda tidak berhak mengakhiri kontrak ini.', 403);
  }
  if (row.status !== PartnershipStatus.ACTIVE) {
    throw new AppError('Hanya kerjasama aktif yang dapat diakhiri.', 400);
  }

  const otherPartyId = row.buyerId === userId ? row.supplierId : row.buyerId;

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: PartnershipStatus.TERMINATED,
      terminatedAt: new Date(),
      terminatedBy: userId,
      rejectionReason: reason ?? null,
    },
    include: partnershipInclude,
  });

  void createNotification({
    userId: otherPartyId,
    title: 'Kerjasama Diakhiri',
    body: `Kontrak kerjasama "${row.title}" telah diakhiri.`,
    type: NotificationType.PARTNERSHIP,
    refId: partnershipId,
  });

  return mapPartnership(updated);
};

/** Ajukan perpanjangan kontrak (buyer atau supplier). */
export const requestRenewal = async (
  partnershipId: string,
  userId: string,
  input: { newEndDate: Date; note?: string },
) => {
  await expireDuePartnerships();

  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: {
      id: true,
      buyerId: true,
      supplierId: true,
      status: true,
      title: true,
      endDate: true,
      renewalRequestedBy: true,
    },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  if (row.buyerId !== userId && row.supplierId !== userId) {
    throw new AppError('Anda tidak berhak memperpanjang kontrak ini.', 403);
  }
  if (row.status === PartnershipStatus.RENEWAL_PENDING) {
    throw new AppError('Sudah ada pengajuan perpanjangan yang menunggu persetujuan.', 400);
  }

  const today = startOfToday();
  const canRequest =
    row.status === PartnershipStatus.EXPIRED ||
    (row.status === PartnershipStatus.ACTIVE &&
      (row.endDate < today || daysUntil(row.endDate) <= 30));

  if (!canRequest) {
    throw new AppError(
      'Perpanjangan hanya bisa diajukan saat kontrak expired atau ≤30 hari sebelum berakhir.',
      400,
    );
  }

  if (input.newEndDate <= row.endDate) {
    throw new AppError(
      'Tanggal perpanjangan harus setelah tanggal berakhir kontrak saat ini.',
      400,
    );
  }

  const durationMs = input.newEndDate.getTime() - row.endDate.getTime();
  const extensionDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  if (extensionDays < 30) {
    throw new AppError('Perpanjangan minimal 30 hari dari tanggal berakhir saat ini.', 400);
  }

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: PartnershipStatus.RENEWAL_PENDING,
      renewalProposedEndDate: input.newEndDate,
      renewalRequestedBy: userId,
      renewalRequestedAt: new Date(),
      renewalNote: input.note ?? null,
    },
    include: partnershipInclude,
  });

  const otherPartyId = row.buyerId === userId ? row.supplierId : row.buyerId;
  void createNotification({
    userId: otherPartyId,
    title: 'Pengajuan Perpanjangan Kontrak',
    body: `Pihak lawan mengajukan perpanjangan kontrak "${row.title}".`,
    type: NotificationType.PARTNERSHIP,
    refId: partnershipId,
  });

  return mapPartnership(updated);
};

/** Setujui perpanjangan kontrak. */
export const acceptRenewal = async (partnershipId: string, userId: string) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: {
      id: true,
      buyerId: true,
      supplierId: true,
      status: true,
      title: true,
      renewalProposedEndDate: true,
      renewalRequestedBy: true,
      renewalCount: true,
    },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  if (row.buyerId !== userId && row.supplierId !== userId) {
    throw new AppError('Anda tidak berhak menyetujui perpanjangan ini.', 403);
  }
  if (row.status !== PartnershipStatus.RENEWAL_PENDING) {
    throw new AppError('Tidak ada pengajuan perpanjangan yang aktif.', 400);
  }
  if (row.renewalRequestedBy === userId) {
    throw new AppError('Anda tidak bisa menyetujui pengajuan perpanjangan sendiri.', 400);
  }
  if (!row.renewalProposedEndDate) {
    throw new AppError('Data perpanjangan tidak lengkap.', 400);
  }

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: PartnershipStatus.ACTIVE,
      endDate: row.renewalProposedEndDate,
      renewalCount: row.renewalCount + 1,
      renewalProposedEndDate: null,
      renewalRequestedBy: null,
      renewalRequestedAt: null,
      renewalNote: null,
    },
    include: partnershipInclude,
  });

  void createNotification({
    userId: row.renewalRequestedBy!,
    title: 'Perpanjangan Disetujui',
    body: `Perpanjangan kontrak "${row.title}" telah disetujui.`,
    type: NotificationType.PARTNERSHIP,
    refId: partnershipId,
  });

  return mapPartnership(updated);
};

/** Tolak pengajuan perpanjangan. */
export const rejectRenewal = async (partnershipId: string, userId: string, reason?: string) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { id: partnershipId },
    select: {
      id: true,
      buyerId: true,
      supplierId: true,
      status: true,
      title: true,
      endDate: true,
      renewalRequestedBy: true,
    },
  });
  if (!row) throw new AppError('Kontrak kerjasama tidak ditemukan.', 404);
  if (row.buyerId !== userId && row.supplierId !== userId) {
    throw new AppError('Anda tidak berhak menolak perpanjangan ini.', 403);
  }
  if (row.status !== PartnershipStatus.RENEWAL_PENDING) {
    throw new AppError('Tidak ada pengajuan perpanjangan yang aktif.', 400);
  }
  if (row.renewalRequestedBy === userId) {
    throw new AppError('Anda tidak bisa menolak pengajuan perpanjangan sendiri.', 400);
  }

  const revertStatus =
    row.endDate < startOfToday() ? PartnershipStatus.EXPIRED : PartnershipStatus.ACTIVE;

  const updated = await prisma.buyerSupplierPartnership.update({
    where: { id: partnershipId },
    data: {
      status: revertStatus,
      renewalProposedEndDate: null,
      renewalRequestedBy: null,
      renewalRequestedAt: null,
      renewalNote: reason ? `[Perpanjangan ditolak] ${reason}` : null,
    },
    include: partnershipInclude,
  });

  void createNotification({
    userId: row.renewalRequestedBy!,
    title: 'Perpanjangan Ditolak',
    body: `Pengajuan perpanjangan kontrak "${row.title}" ditolak.`,
    type: NotificationType.PARTNERSHIP,
    refId: partnershipId,
  });

  return mapPartnership(updated);
};

export const getPublicContractVerification = async (contractNumber: string) => {
  const row = await prisma.buyerSupplierPartnership.findUnique({
    where: { contractNumber },
    include: partnershipInclude,
  });
  if (!row) throw new AppError('Kontrak tidak ditemukan.', 404);

  return {
    contractNumber: row.contractNumber,
    title: row.title,
    status: row.status,
    tier: row.tier,
    startDate: row.startDate,
    endDate: row.endDate,
    isFullySigned: row.isFullySigned,
    requiredSigners: 3,
    signedCount: [row.buyerSignedAt, row.sellerSignedAt, row.platformSignedAt].filter(Boolean)
      .length,
    buyerSignedAt: row.buyerSignedAt,
    sellerSignedAt: row.sellerSignedAt,
    platformSignedAt: row.platformSignedAt,
    buyer: {
      fullName: row.buyerSignerName ?? row.buyer.fullName,
      signerTitle: row.buyerSignerTitle ?? null,
      companyName: row.buyerCompanyName ?? row.buyer.profile?.companyName ?? null,
    },
    supplier: {
      fullName: row.sellerSignerName ?? row.supplier.fullName,
      signerTitle: row.sellerSignerTitle ?? null,
      companyName: row.sellerCompanyName ?? row.supplier.profile?.companyName ?? null,
    },
    platform: {
      fullName: row.platformSignerName ?? 'BISA Agri',
      signerTitle: row.platformSignerTitle ?? 'General Manager',
      companyName: 'BISA Agri',
      role: 'PENENGAH',
    },
    signatures: [
      {
        party: 'BUYER',
        signedAt: row.buyerSignedAt,
        signerName: row.buyerSignerName ?? row.buyer.fullName,
        signerTitle: row.buyerSignerTitle ?? null,
        companyName: row.buyerCompanyName ?? row.buyer.profile?.companyName ?? null,
      },
      {
        party: 'SUPPLIER',
        signedAt: row.sellerSignedAt,
        signerName: row.sellerSignerName ?? row.supplier.fullName,
        signerTitle: row.sellerSignerTitle ?? null,
        companyName: row.sellerCompanyName ?? row.supplier.profile?.companyName ?? null,
      },
      {
        party: 'PLATFORM',
        signedAt: row.platformSignedAt,
        signerName: row.platformSignerName ?? 'BISA Agri',
        signerTitle: row.platformSignerTitle ?? 'General Manager',
        companyName: 'BISA Agri',
      },
    ],
    verifiedAt: new Date(),
  };
};
