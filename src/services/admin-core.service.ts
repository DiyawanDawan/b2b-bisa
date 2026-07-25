import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  Prisma,
  RfqStatus,
  BookingStatus,
  ReferralRewardStatus,
  LiveSessionStatus,
  ProductMode,
  NotificationType,
} from '#prisma';
import { createAuditLog } from '#services/admin.service';
import { createNotification } from '#services/notification.service';
import { resolveMediaField } from '#utils/mediaResolver.util';

const partySelect = {
  id: true,
  fullName: true,
  email: true,
  avatarUrl: true,
} as const;

const pageMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / Math.max(1, limit)),
});

/* ========================================================================== */
/* RFQ management                                                             */
/* ========================================================================== */

export const listRfqsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: RfqStatus;
  productMode?: ProductMode;
  isFlagged?: boolean;
  expired?: boolean;
}) => {
  const { page, limit, search, status, productMode, isFlagged, expired } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.RfqWhereInput = {
    ...(status && { status }),
    ...(productMode && { productMode }),
    ...(isFlagged !== undefined && { isFlagged }),
    ...(expired !== undefined &&
      (expired
        ? { deliveryDate: { lt: new Date() } }
        : { OR: [{ deliveryDate: null }, { deliveryDate: { gte: new Date() } }] })),
    ...(search && {
      OR: [
        { title: { contains: search } },
        { specifications: { contains: search } },
        { buyer: { fullName: { contains: search } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.rfq.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        buyer: { select: partySelect },
        category: { select: { id: true, name: true } },
        _count: { select: { responses: true } },
      },
    }),
    prisma.rfq.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      ...r,
      buyer: { ...r.buyer, avatarUrl: resolveMediaField(r.buyer.avatarUrl) },
      responseCount: r._count.responses,
    })),
    pagination: pageMeta(total, page, limit),
  };
};

export const getRfqAdmin = async (id: string) => {
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      buyer: { select: partySelect },
      category: { select: { id: true, name: true } },
      responses: {
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: partySelect },
          negotiation: { select: { id: true, status: true, roomType: true } },
        },
      },
    },
  });
  if (!rfq) throw new AppError('RFQ tidak ditemukan', 404);

  const respondedCount = rfq.responses.length;
  const convertedCount = rfq.responses.filter((r) => r.negotiationId).length;

  return {
    ...rfq,
    buyer: { ...rfq.buyer, avatarUrl: resolveMediaField(rfq.buyer.avatarUrl) },
    responses: rfq.responses.map((r) => ({
      ...r,
      supplier: { ...r.supplier, avatarUrl: resolveMediaField(r.supplier.avatarUrl) },
    })),
    conversion: {
      respondedCount,
      convertedCount,
      conversionRate:
        respondedCount === 0 ? 0 : Math.round((convertedCount / respondedCount) * 100),
      isExpired: rfq.deliveryDate ? rfq.deliveryDate < new Date() : false,
      status: rfq.status,
    },
  };
};

export const updateRfqStatusAdmin = async (
  id: string,
  status: RfqStatus,
  reason: string,
  adminId: string,
) => {
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    select: { id: true, status: true, buyerId: true },
  });
  if (!rfq) throw new AppError('RFQ tidak ditemukan', 404);

  const updated = await prisma.rfq.update({
    where: { id },
    data: {
      status,
      ...(status === RfqStatus.CLOSED && { cancelledAt: new Date(), cancelReason: reason }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_RFQ_STATUS',
    entity: 'RFQ',
    entityId: id,
    oldValue: { status: rfq.status },
    newValue: { status, reason },
  });

  void createNotification({
    userId: rfq.buyerId,
    title: 'Status RFQ Diperbarui',
    body: `RFQ Anda diubah admin menjadi ${status}. Alasan: ${reason}`,
    type: NotificationType.RFQ,
    refId: id,
  });

  return updated;
};

export const cancelRfqAdmin = async (id: string, reason: string, adminId: string) => {
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    select: { id: true, status: true, buyerId: true },
  });
  if (!rfq) throw new AppError('RFQ tidak ditemukan', 404);
  if (rfq.status === RfqStatus.CLOSED) throw new AppError('RFQ sudah ditutup', 400);

  const updated = await prisma.rfq.update({
    where: { id },
    data: { status: RfqStatus.CLOSED, cancelledAt: new Date(), cancelReason: reason },
  });

  await createAuditLog({
    userId: adminId,
    action: 'CANCEL_RFQ',
    entity: 'RFQ',
    entityId: id,
    oldValue: { status: rfq.status },
    newValue: { status: RfqStatus.CLOSED, reason },
  });

  void createNotification({
    userId: rfq.buyerId,
    title: 'RFQ Ditutup Admin',
    body: `RFQ Anda ditutup oleh admin. Alasan: ${reason}`,
    type: NotificationType.RFQ,
    refId: id,
  });

  return updated;
};

export const expireRfqAdmin = async (id: string, adminId: string) => {
  const rfq = await prisma.rfq.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!rfq) throw new AppError('RFQ tidak ditemukan', 404);
  if (rfq.status === RfqStatus.EXPIRED) throw new AppError('RFQ sudah kedaluwarsa', 400);

  const updated = await prisma.rfq.update({ where: { id }, data: { status: RfqStatus.EXPIRED } });
  await createAuditLog({
    userId: adminId,
    action: 'EXPIRE_RFQ',
    entity: 'RFQ',
    entityId: id,
    oldValue: { status: rfq.status },
    newValue: { status: RfqStatus.EXPIRED },
  });
  return updated;
};

export const flagRfqAdmin = async (
  id: string,
  flagged: boolean,
  reason: string | undefined,
  adminId: string,
) => {
  const rfq = await prisma.rfq.findUnique({ where: { id }, select: { id: true, isFlagged: true } });
  if (!rfq) throw new AppError('RFQ tidak ditemukan', 404);
  if (flagged && !reason?.trim()) throw new AppError('Alasan wajib saat menandai RFQ', 400);

  const updated = await prisma.rfq.update({
    where: { id },
    data: {
      isFlagged: flagged,
      flagReason: flagged ? reason : null,
      flaggedAt: flagged ? new Date() : null,
    },
  });
  await createAuditLog({
    userId: adminId,
    action: flagged ? 'FLAG_RFQ' : 'UNFLAG_RFQ',
    entity: 'RFQ',
    entityId: id,
    oldValue: { isFlagged: rfq.isFlagged },
    newValue: { isFlagged: flagged, reason: reason ?? null },
  });
  return updated;
};

/* ========================================================================== */
/* Booking management                                                         */
/* ========================================================================== */

const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING_PAYMENT]: [
    BookingStatus.CONFIRMED,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONFIRMED]: [BookingStatus.FULFILLED, BookingStatus.CANCELLED],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.FULFILLED]: [],
};

export const getAllowedBookingTransitions = (status: BookingStatus) =>
  BOOKING_STATUS_TRANSITIONS[status] ?? [];

const bookingListInclude = {
  buyer: { select: partySelect },
  supplier: { select: partySelect },
  product: { select: { id: true, name: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      dispute: { select: { id: true, status: true } },
    },
  },
} satisfies Prisma.BookingInclude;

export const listBookingsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: BookingStatus;
  hasDispute?: boolean;
}) => {
  const { page, limit, search, status, hasDispute } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.BookingWhereInput = {
    ...(status && { status }),
    ...(hasDispute === true && { order: { is: { dispute: { isNot: null } } } }),
    ...(hasDispute === false && { NOT: { order: { is: { dispute: { isNot: null } } } } }),
    ...(search && {
      OR: [
        { bookingNumber: { contains: search } },
        { buyer: { fullName: { contains: search } } },
        { supplier: { fullName: { contains: search } } },
        { product: { name: { contains: search } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: bookingListInclude,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    items: items.map((b) => ({
      ...b,
      buyer: { ...b.buyer, avatarUrl: resolveMediaField(b.buyer.avatarUrl) },
      supplier: { ...b.supplier, avatarUrl: resolveMediaField(b.supplier.avatarUrl) },
      disputeId: b.order?.dispute?.id ?? null,
    })),
    pagination: pageMeta(total, page, limit),
  };
};

export const getBookingAdmin = async (id: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      ...bookingListInclude,
      harvestLot: {
        select: {
          id: true,
          seasonLabel: true,
          expectedHarvestDate: true,
          status: true,
        },
      },
    },
  });
  if (!booking) throw new AppError('Booking tidak ditemukan', 404);

  return {
    ...booking,
    buyer: { ...booking.buyer, avatarUrl: resolveMediaField(booking.buyer.avatarUrl) },
    supplier: { ...booking.supplier, avatarUrl: resolveMediaField(booking.supplier.avatarUrl) },
    allowedTransitions: getAllowedBookingTransitions(booking.status),
    dispute: booking.order?.dispute ?? null,
    links: {
      order: booking.order ? `/orders/${booking.order.id}` : null,
      dispute: booking.order?.dispute ? `/disputes/${booking.order.id}` : null,
    },
  };
};

export const updateBookingStatusAdmin = async (
  id: string,
  status: BookingStatus,
  reason: string,
  adminId: string,
) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, status: true, bookingNumber: true, buyerId: true, supplierId: true },
  });
  if (!booking) throw new AppError('Booking tidak ditemukan', 404);
  if (status === BookingStatus.CANCELLED) {
    throw new AppError('Gunakan endpoint cancel untuk membatalkan booking', 400);
  }

  const allowed = getAllowedBookingTransitions(booking.status);
  if (!allowed.includes(status)) {
    throw new AppError(
      `Transisi ${booking.status} → ${status} tidak diizinkan. Diizinkan: ${allowed.join(', ') || 'tidak ada'}`,
      400,
    );
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status, ...(status === BookingStatus.CONFIRMED && { confirmedAt: new Date() }) },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_BOOKING_STATUS',
    entity: 'BOOKING',
    entityId: id,
    oldValue: { status: booking.status },
    newValue: { status, reason },
  });

  for (const uid of [booking.buyerId, booking.supplierId]) {
    void createNotification({
      userId: uid,
      title: 'Status Booking Diperbarui',
      body: `Booking ${booking.bookingNumber} diubah admin menjadi ${status}. Alasan: ${reason}`,
      type: NotificationType.BOOKING,
      refId: id,
    });
  }

  return updated;
};

export const cancelBookingAdmin = async (id: string, reason: string, adminId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, status: true, bookingNumber: true, buyerId: true, supplierId: true },
  });
  if (!booking) throw new AppError('Booking tidak ditemukan', 404);

  const cancellable: BookingStatus[] = [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED];
  if (!cancellable.includes(booking.status)) {
    throw new AppError(`Booking berstatus ${booking.status} tidak dapat dibatalkan`, 400);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: BookingStatus.CANCELLED, cancelledById: adminId, cancelReason: reason },
  });

  await createAuditLog({
    userId: adminId,
    action: 'CANCEL_BOOKING',
    entity: 'BOOKING',
    entityId: id,
    oldValue: { status: booking.status },
    newValue: { status: BookingStatus.CANCELLED, reason },
  });

  for (const uid of [booking.buyerId, booking.supplierId]) {
    void createNotification({
      userId: uid,
      title: 'Booking Dibatalkan Admin',
      body: `Booking ${booking.bookingNumber} dibatalkan admin. Alasan: ${reason}`,
      type: NotificationType.BOOKING,
      refId: id,
    });
  }

  return updated;
};

export const rescheduleBookingAdmin = async (
  id: string,
  data: { expiresAt?: string; expectedDeliveryDate?: string | null; reason: string },
  adminId: string,
) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      bookingNumber: true,
      buyerId: true,
      supplierId: true,
      expiresAt: true,
      expectedDeliveryDate: true,
    },
  });
  if (!booking) throw new AppError('Booking tidak ditemukan', 404);

  const reschedulable: BookingStatus[] = [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED];
  if (!reschedulable.includes(booking.status)) {
    throw new AppError(`Booking berstatus ${booking.status} tidak dapat dijadwal ulang`, 400);
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      ...(data.expiresAt !== undefined && { expiresAt: new Date(data.expiresAt) }),
      ...(data.expectedDeliveryDate !== undefined && {
        expectedDeliveryDate: data.expectedDeliveryDate
          ? new Date(data.expectedDeliveryDate)
          : null,
      }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'RESCHEDULE_BOOKING',
    entity: 'BOOKING',
    entityId: id,
    oldValue: { expiresAt: booking.expiresAt, expectedDeliveryDate: booking.expectedDeliveryDate },
    newValue: {
      expiresAt: data.expiresAt ?? booking.expiresAt,
      expectedDeliveryDate: data.expectedDeliveryDate,
      reason: data.reason,
    },
  });

  for (const uid of [booking.buyerId, booking.supplierId]) {
    void createNotification({
      userId: uid,
      title: 'Booking Dijadwalkan Ulang',
      body: `Jadwal booking ${booking.bookingNumber} diperbarui admin. Alasan: ${data.reason}`,
      type: NotificationType.BOOKING,
      refId: id,
    });
  }

  return updated;
};

/* ========================================================================== */
/* Review moderation                                                          */
/* ========================================================================== */

const reviewInclude = {
  buyer: { select: partySelect },
  product: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true } },
} as const;

export const listReviewsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  rating?: number;
  status?: 'visible' | 'hidden' | 'flagged';
  productId?: string;
}) => {
  const { page, limit, search, rating, status, productId } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.ReviewWhereInput = {
    ...(rating && { rating }),
    ...(productId && { productId }),
    ...(status === 'hidden' && { isHidden: true }),
    ...(status === 'visible' && { isHidden: false }),
    ...(status === 'flagged' && { isFlagged: true }),
    ...(search && {
      OR: [
        { comment: { contains: search } },
        { buyer: { fullName: { contains: search } } },
        { product: { name: { contains: search } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ isFlagged: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: reviewInclude,
    }),
    prisma.review.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      ...r,
      imageUrl: resolveMediaField(r.imageUrl),
      buyer: { ...r.buyer, avatarUrl: resolveMediaField(r.buyer.avatarUrl) },
    })),
    pagination: pageMeta(total, page, limit),
  };
};

export const getReviewAdmin = async (id: string) => {
  const review = await prisma.review.findUnique({ where: { id }, include: reviewInclude });
  if (!review) throw new AppError('Ulasan tidak ditemukan', 404);
  return {
    ...review,
    imageUrl: resolveMediaField(review.imageUrl),
    buyer: { ...review.buyer, avatarUrl: resolveMediaField(review.buyer.avatarUrl) },
  };
};

export const hideReviewAdmin = async (id: string, reason: string, adminId: string) => {
  const review = await prisma.review.findUnique({
    where: { id },
    select: { id: true, isHidden: true },
  });
  if (!review) throw new AppError('Ulasan tidak ditemukan', 404);
  if (review.isHidden) throw new AppError('Ulasan sudah disembunyikan', 400);

  const updated = await prisma.review.update({
    where: { id },
    data: {
      isHidden: true,
      moderationReason: reason,
      moderatedAt: new Date(),
      moderatedById: adminId,
    },
  });
  await createAuditLog({
    userId: adminId,
    action: 'HIDE_REVIEW',
    entity: 'REVIEW',
    entityId: id,
    newValue: { isHidden: true, reason },
  });
  return updated;
};

export const restoreReviewAdmin = async (id: string, adminId: string) => {
  const review = await prisma.review.findUnique({
    where: { id },
    select: { id: true, isHidden: true },
  });
  if (!review) throw new AppError('Ulasan tidak ditemukan', 404);
  if (!review.isHidden) throw new AppError('Ulasan sudah tampil', 400);

  const updated = await prisma.review.update({
    where: { id },
    data: {
      isHidden: false,
      moderationReason: null,
      moderatedAt: new Date(),
      moderatedById: adminId,
    },
  });
  await createAuditLog({
    userId: adminId,
    action: 'RESTORE_REVIEW',
    entity: 'REVIEW',
    entityId: id,
    newValue: { isHidden: false },
  });
  return updated;
};

export const flagReviewAdmin = async (
  id: string,
  flagged: boolean,
  reason: string | undefined,
  adminId: string,
) => {
  const review = await prisma.review.findUnique({
    where: { id },
    select: { id: true, isFlagged: true },
  });
  if (!review) throw new AppError('Ulasan tidak ditemukan', 404);
  if (flagged && !reason?.trim()) throw new AppError('Alasan wajib saat menandai ulasan', 400);

  const updated = await prisma.review.update({
    where: { id },
    data: {
      isFlagged: flagged,
      flagReason: flagged ? reason : null,
      flaggedAt: flagged ? new Date() : null,
    },
  });
  await createAuditLog({
    userId: adminId,
    action: flagged ? 'FLAG_REVIEW' : 'UNFLAG_REVIEW',
    entity: 'REVIEW',
    entityId: id,
    oldValue: { isFlagged: review.isFlagged },
    newValue: { isFlagged: flagged, reason: reason ?? null },
  });
  return updated;
};

/* ========================================================================== */
/* Referral management                                                        */
/* ========================================================================== */

const SUSPICIOUS_PENDING_THRESHOLD = 3;

/** Referrers with an unusually high number of PENDING rewards (velocity heuristic). */
async function suspiciousReferrerIds(): Promise<string[]> {
  const grouped = await prisma.referralReward.groupBy({
    by: ['referrerId'],
    where: { status: ReferralRewardStatus.PENDING },
    _count: { _all: true },
    having: { referrerId: { _count: { gte: SUSPICIOUS_PENDING_THRESHOLD } } },
  });
  return grouped.map((g) => g.referrerId);
}

export const listReferralsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: ReferralRewardStatus;
  suspicious?: boolean;
}) => {
  const { page, limit, search, status, suspicious } = params;
  const skip = (page - 1) * limit;

  let suspiciousIds: string[] | null = null;
  if (suspicious !== undefined) suspiciousIds = await suspiciousReferrerIds();

  const where: Prisma.ReferralRewardWhereInput = {
    ...(status && { status }),
    ...(suspicious === true && {
      referrerId: { in: suspiciousIds!.length ? suspiciousIds! : ['__none__'] },
    }),
    ...(suspicious === false &&
      suspiciousIds!.length > 0 && { referrerId: { notIn: suspiciousIds! } }),
    ...(search && {
      OR: [
        { referrer: { fullName: { contains: search } } },
        { referrer: { email: { contains: search } } },
        { referredUser: { fullName: { contains: search } } },
        { referredUser: { email: { contains: search } } },
      ],
    }),
  };

  const [items, total, flaggedIds] = await Promise.all([
    prisma.referralReward.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        referrer: { select: { ...partySelect, createdAt: true } },
        referredUser: { select: { ...partySelect, createdAt: true, status: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.referralReward.count({ where }),
    suspicious === undefined ? suspiciousReferrerIds() : Promise.resolve(suspiciousIds!),
  ]);

  const flaggedSet = new Set(flaggedIds);

  return {
    items: items.map((r) => ({
      ...r,
      amount: Number(r.amount),
      referrer: { ...r.referrer, avatarUrl: resolveMediaField(r.referrer.avatarUrl) },
      referredUser: { ...r.referredUser, avatarUrl: resolveMediaField(r.referredUser.avatarUrl) },
      suspicious: flaggedSet.has(r.referrerId) || computeQuickFraud(r),
    })),
    pagination: pageMeta(total, page, limit),
  };
};

type ReferralRow = {
  createdAt: Date;
  order: { id: string } | null;
  referrer: { email: string; createdAt: Date };
  referredUser: { email: string; createdAt: Date; status: string };
};

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

function computeQuickFraud(row: ReferralRow): boolean {
  const sameDomain =
    Boolean(emailDomain(row.referrer.email)) &&
    emailDomain(row.referrer.email) === emailDomain(row.referredUser.email);
  const rapidSignup =
    Math.abs(row.referredUser.createdAt.getTime() - row.referrer.createdAt.getTime()) <
    5 * 60 * 1000;
  return sameDomain || rapidSignup;
}

export const getReferralAdmin = async (id: string) => {
  const reward = await prisma.referralReward.findUnique({
    where: { id },
    include: {
      referrer: { select: { ...partySelect, createdAt: true, referralCode: true } },
      referredUser: { select: { ...partySelect, createdAt: true, status: true } },
      order: { select: { id: true, orderNumber: true, status: true } },
    },
  });
  if (!reward) throw new AppError('Reward referral tidak ditemukan', 404);

  const [referrerTotal, referrerPending, referredOrderCount] = await Promise.all([
    prisma.referralReward.count({ where: { referrerId: reward.referrerId } }),
    prisma.referralReward.count({
      where: { referrerId: reward.referrerId, status: ReferralRewardStatus.PENDING },
    }),
    prisma.order.count({ where: { buyerId: reward.referredUserId } }),
  ]);

  const sameEmailDomain =
    Boolean(emailDomain(reward.referrer.email)) &&
    emailDomain(reward.referrer.email) === emailDomain(reward.referredUser.email);
  const rapidSignup =
    Math.abs(reward.referredUser.createdAt.getTime() - reward.referrer.createdAt.getTime()) <
    5 * 60 * 1000;

  const fraudIndicators = {
    sameEmailDomain,
    rapidSignup,
    referredNeverOrdered: referredOrderCount === 0,
    referredInactive: reward.referredUser.status !== 'ACTIVE',
    highReferrerVelocity: referrerPending >= SUSPICIOUS_PENDING_THRESHOLD,
  };
  const riskScore = Object.values(fraudIndicators).filter(Boolean).length;

  return {
    ...reward,
    amount: Number(reward.amount),
    referrer: { ...reward.referrer, avatarUrl: resolveMediaField(reward.referrer.avatarUrl) },
    referredUser: {
      ...reward.referredUser,
      avatarUrl: resolveMediaField(reward.referredUser.avatarUrl),
    },
    stats: { referrerTotal, referrerPending, referredOrderCount },
    fraudIndicators,
    riskScore,
    suspicious: riskScore >= 2,
  };
};

export const approveReferralAdmin = async (id: string, reason: string, adminId: string) => {
  const reward = await prisma.referralReward.findUnique({
    where: { id },
    select: { id: true, referrerId: true, status: true, amount: true },
  });
  if (!reward) throw new AppError('Reward referral tidak ditemukan', 404);
  if (reward.status !== ReferralRewardStatus.PENDING) {
    throw new AppError(`Reward berstatus ${reward.status} tidak dapat disetujui`, 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.referralReward.update({
      where: { id },
      data: { status: ReferralRewardStatus.CREDITED, creditedAt: new Date() },
    });
    await tx.wallet.upsert({
      where: { userId: reward.referrerId },
      create: { userId: reward.referrerId, balance: reward.amount, totalEarned: reward.amount },
      update: { balance: { increment: reward.amount }, totalEarned: { increment: reward.amount } },
    });
    return row;
  });

  await createAuditLog({
    userId: adminId,
    action: 'APPROVE_REFERRAL',
    entity: 'REFERRAL_REWARD',
    entityId: id,
    oldValue: { status: reward.status },
    newValue: { status: ReferralRewardStatus.CREDITED, amount: Number(reward.amount), reason },
  });

  void createNotification({
    userId: reward.referrerId,
    title: 'Reward Referral Disetujui',
    body: `Reward referral Rp${Number(reward.amount).toLocaleString('id-ID')} telah dikreditkan ke wallet Anda.`,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    refId: id,
  });

  return { ...updated, amount: Number(updated.amount) };
};

export const rejectReferralAdmin = async (id: string, reason: string, adminId: string) => {
  const reward = await prisma.referralReward.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!reward) throw new AppError('Reward referral tidak ditemukan', 404);
  if (reward.status !== ReferralRewardStatus.PENDING) {
    throw new AppError(
      `Hanya reward PENDING yang dapat ditolak (status saat ini ${reward.status})`,
      400,
    );
  }

  const updated = await prisma.referralReward.update({
    where: { id },
    data: { status: ReferralRewardStatus.CANCELLED },
  });
  await createAuditLog({
    userId: adminId,
    action: 'REJECT_REFERRAL',
    entity: 'REFERRAL_REWARD',
    entityId: id,
    oldValue: { status: reward.status },
    newValue: { status: ReferralRewardStatus.CANCELLED, reason },
  });
  return { ...updated, amount: Number(updated.amount) };
};

export const revokeReferralAdmin = async (id: string, reason: string, adminId: string) => {
  const reward = await prisma.referralReward.findUnique({
    where: { id },
    select: { id: true, status: true, referrerId: true, amount: true },
  });
  if (!reward) throw new AppError('Reward referral tidak ditemukan', 404);
  if (reward.status !== ReferralRewardStatus.CREDITED) {
    throw new AppError('Hanya reward CREDITED yang dapat dicabut', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.referralReward.update({
      where: { id },
      data: { status: ReferralRewardStatus.CANCELLED },
    });
    // Claw back the credited amount from the referrer wallet.
    await tx.wallet.update({
      where: { userId: reward.referrerId },
      data: { balance: { decrement: reward.amount }, totalEarned: { decrement: reward.amount } },
    });
    return row;
  });

  await createAuditLog({
    userId: adminId,
    action: 'REVOKE_REFERRAL',
    entity: 'REFERRAL_REWARD',
    entityId: id,
    oldValue: { status: reward.status },
    newValue: { status: ReferralRewardStatus.CANCELLED, clawback: Number(reward.amount), reason },
  });

  void createNotification({
    userId: reward.referrerId,
    title: 'Reward Referral Dicabut',
    body: `Reward referral Rp${Number(reward.amount).toLocaleString('id-ID')} dicabut admin. Alasan: ${reason}`,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    refId: id,
  });

  return { ...updated, amount: Number(updated.amount) };
};

/* ========================================================================== */
/* Live commerce                                                              */
/* ========================================================================== */

const liveSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  streamUrl: true,
  thumbnailUrl: true,
  pinnedProductIds: true,
  viewerCount: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: partySelect },
  _count: { select: { comments: true } },
} as const;

export const listLiveSessionsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: LiveSessionStatus;
  supplierId?: string;
}) => {
  const { page, limit, search, status, supplierId } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.LiveSessionWhereInput = {
    ...(status && { status }),
    ...(supplierId && { supplierId }),
    ...(search && {
      OR: [{ title: { contains: search } }, { supplier: { fullName: { contains: search } } }],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.liveSession.findMany({
      where,
      orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: liveSelect,
    }),
    prisma.liveSession.count({ where }),
  ]);

  return {
    items: items.map((s) => ({
      ...s,
      thumbnailUrl: resolveMediaField(s.thumbnailUrl),
      supplier: { ...s.supplier, avatarUrl: resolveMediaField(s.supplier.avatarUrl) },
      commentCount: s._count.comments,
      pinnedProductCount: Array.isArray(s.pinnedProductIds) ? s.pinnedProductIds.length : 0,
    })),
    pagination: pageMeta(total, page, limit),
  };
};

export const getLiveSessionAdmin = async (id: string) => {
  const session = await prisma.liveSession.findUnique({ where: { id }, select: liveSelect });
  if (!session) throw new AppError('Live session tidak ditemukan', 404);

  const pinnedIds = Array.isArray(session.pinnedProductIds)
    ? (session.pinnedProductIds as string[])
    : [];

  const [pinnedProducts, comments] = await Promise.all([
    pinnedIds.length
      ? prisma.product.findMany({
          where: { id: { in: pinnedIds } },
          select: { id: true, name: true, pricePerUnit: true, status: true },
        })
      : Promise.resolve([]),
    prisma.liveSessionComment.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        message: true,
        createdAt: true,
        user: { select: partySelect },
      },
    }),
  ]);

  const durationMinutes =
    session.startedAt && session.endedAt
      ? Math.max(0, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000))
      : null;

  return {
    ...session,
    thumbnailUrl: resolveMediaField(session.thumbnailUrl),
    supplier: { ...session.supplier, avatarUrl: resolveMediaField(session.supplier.avatarUrl) },
    pinnedProducts: pinnedProducts.map((p) => ({ ...p, pricePerUnit: Number(p.pricePerUnit) })),
    comments: comments.map((c) => ({
      ...c,
      user: { ...c.user, avatarUrl: resolveMediaField(c.user.avatarUrl) },
    })),
    analytics: {
      viewerCount: session.viewerCount,
      commentCount: session._count.comments,
      durationMinutes,
      hasRecording: Boolean(session.streamUrl),
      engagementPerViewer:
        session.viewerCount > 0
          ? Math.round((session._count.comments / session.viewerCount) * 100) / 100
          : 0,
    },
  };
};

export const terminateLiveSessionAdmin = async (id: string, reason: string, adminId: string) => {
  const session = await prisma.liveSession.findUnique({
    where: { id },
    select: { id: true, status: true, supplierId: true, title: true },
  });
  if (!session) throw new AppError('Live session tidak ditemukan', 404);
  if (session.status === LiveSessionStatus.ENDED) {
    throw new AppError('Live session sudah berakhir', 400);
  }

  const updated = await prisma.liveSession.update({
    where: { id },
    data: { status: LiveSessionStatus.ENDED, endedAt: new Date() },
  });

  await createAuditLog({
    userId: adminId,
    action: 'TERMINATE_LIVE_SESSION',
    entity: 'LIVE_SESSION',
    entityId: id,
    oldValue: { status: session.status },
    newValue: { status: LiveSessionStatus.ENDED, reason },
  });

  void createNotification({
    userId: session.supplierId,
    title: 'Live Session Dihentikan Admin',
    body: `Sesi live "${session.title}" dihentikan admin. Alasan: ${reason}`,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    refId: id,
  });

  return updated;
};

export const updateLiveStatusAdmin = async (
  id: string,
  status: LiveSessionStatus,
  reason: string | undefined,
  adminId: string,
) => {
  const session = await prisma.liveSession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!session) throw new AppError('Live session tidak ditemukan', 404);

  const updated = await prisma.liveSession.update({
    where: { id },
    data: {
      status,
      ...(status === LiveSessionStatus.LIVE && { startedAt: new Date() }),
      ...(status === LiveSessionStatus.ENDED && { endedAt: new Date() }),
    },
  });
  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_LIVE_STATUS',
    entity: 'LIVE_SESSION',
    entityId: id,
    oldValue: { status: session.status },
    newValue: { status, reason: reason ?? null },
  });
  return updated;
};

export const pinLiveProductsAdmin = async (
  id: string,
  pinnedProductIds: string[],
  adminId: string,
) => {
  const session = await prisma.liveSession.findUnique({ where: { id }, select: { id: true } });
  if (!session) throw new AppError('Live session tidak ditemukan', 404);

  if (pinnedProductIds.length) {
    const found = await prisma.product.count({ where: { id: { in: pinnedProductIds } } });
    if (found !== pinnedProductIds.length) {
      throw new AppError('Sebagian produk pin tidak ditemukan', 400);
    }
  }

  const updated = await prisma.liveSession.update({
    where: { id },
    data: { pinnedProductIds },
  });
  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_LIVE_PINNED_PRODUCTS',
    entity: 'LIVE_SESSION',
    entityId: id,
    newValue: { pinnedProductIds },
  });
  return updated;
};

export const moderateLiveCommentAdmin = async (
  sessionId: string,
  commentId: string,
  reason: string,
  adminId: string,
) => {
  const comment = await prisma.liveSessionComment.findFirst({
    where: { id: commentId, sessionId },
    select: { id: true, message: true, userId: true },
  });
  if (!comment) throw new AppError('Komentar tidak ditemukan', 404);

  await prisma.liveSessionComment.delete({ where: { id: commentId } });
  await createAuditLog({
    userId: adminId,
    action: 'MODERATE_LIVE_COMMENT',
    entity: 'LIVE_SESSION',
    entityId: sessionId,
    oldValue: { commentId, message: comment.message, userId: comment.userId },
    newValue: { deleted: true, reason },
  });
  return { deleted: true, commentId };
};
