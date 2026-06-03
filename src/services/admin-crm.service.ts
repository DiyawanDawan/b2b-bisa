import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  NegotiationStatus,
  OrderStatus,
  Prisma,
  UserRole,
  UserStatus,
  VerificationStatus,
} from '#prisma';

export const CRM_STAGES = ['LEAD', 'PROSPECT', 'ACTIVE', 'VIP', 'AT_RISK'] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

const OPEN_NEGO_STATUSES: NegotiationStatus[] = [
  NegotiationStatus.OPEN_NEGOTIATION,
  NegotiationStatus.OFFER_SUBMITTED,
  NegotiationStatus.OFFER_ACCEPTED,
];

const VIP_GMV_THRESHOLD = 50_000_000;
const VIP_ORDER_COUNT = 5;
const AT_RISK_DAYS = 90;

type UserMetrics = {
  completedOrders: number;
  completedGmv: number;
  lastOrderAt: Date | null;
  openNegotiations: number;
  cartItems: number;
  status: UserStatus;
};

async function getUserMetricsBatch(userIds: string[]): Promise<Map<string, UserMetrics>> {
  const map = new Map<string, UserMetrics>();
  if (userIds.length === 0) return map;

  for (const id of userIds) {
    map.set(id, {
      completedOrders: 0,
      completedGmv: 0,
      lastOrderAt: null,
      openNegotiations: 0,
      cartItems: 0,
      status: UserStatus.ACTIVE,
    });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, status: true },
  });
  for (const u of users) {
    const m = map.get(u.id);
    if (m) m.status = u.status;
  }

  const completedOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.COMPLETED,
      OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }],
    },
    select: { buyerId: true, sellerId: true, totalAmount: true, createdAt: true },
  });

  for (const o of completedOrders) {
    for (const uid of [o.buyerId, o.sellerId]) {
      if (!userIds.includes(uid)) continue;
      const m = map.get(uid)!;
      m.completedOrders += 1;
      m.completedGmv += Number(o.totalAmount ?? 0);
      if (!m.lastOrderAt || o.createdAt > m.lastOrderAt) {
        m.lastOrderAt = o.createdAt;
      }
    }
  }

  const openNegos = await prisma.negotiation.findMany({
    where: {
      status: { in: OPEN_NEGO_STATUSES },
      OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }],
    },
    select: { buyerId: true, sellerId: true },
  });
  for (const n of openNegos) {
    for (const uid of [n.buyerId, n.sellerId]) {
      if (!userIds.includes(uid)) continue;
      map.get(uid)!.openNegotiations += 1;
    }
  }

  const carts = await prisma.cartItem.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _count: { id: true },
  });
  for (const c of carts) {
    const m = map.get(c.userId);
    if (m) m.cartItems = c._count.id;
  }

  return map;
}

export function computeCrmStage(metrics: UserMetrics): CrmStage {
  if (metrics.status === UserStatus.BLOCKED || metrics.status === UserStatus.INACTIVE) {
    return 'AT_RISK';
  }
  if (metrics.completedOrders >= VIP_ORDER_COUNT || metrics.completedGmv >= VIP_GMV_THRESHOLD) {
    return 'VIP';
  }
  if (metrics.completedOrders > 0) {
    if (metrics.lastOrderAt) {
      const days = (Date.now() - metrics.lastOrderAt.getTime()) / 86400000;
      if (days > AT_RISK_DAYS) return 'AT_RISK';
    }
    return 'ACTIVE';
  }
  if (metrics.openNegotiations > 0 || metrics.cartItems > 0) return 'PROSPECT';
  return 'LEAD';
}

function buildStageOverrideMap(
  logs: { entityId: string | null; newValue: unknown }[],
): Map<string, CrmStage> {
  const map = new Map<string, CrmStage>();
  for (const row of logs) {
    if (!row.entityId || map.has(row.entityId)) continue;
    const val = row.newValue as { stage?: string } | null;
    if (val?.stage && CRM_STAGES.includes(val.stage as CrmStage)) {
      map.set(row.entityId, val.stage as CrmStage);
    }
  }
  return map;
}

function buildFollowUpMap(
  logs: { entityId: string | null; newValue: unknown }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of logs) {
    if (!row.entityId || map.has(row.entityId)) continue;
    const val = row.newValue as { nextFollowUpAt?: string } | null;
    if (val?.nextFollowUpAt) map.set(row.entityId, val.nextFollowUpAt);
  }
  return map;
}

async function loadCrmMetaMaps(userIds: string[]) {
  if (userIds.length === 0) {
    return { stageOverrides: new Map<string, CrmStage>(), followUps: new Map<string, string>() };
  }
  const [stageLogs, followLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'CRM_STAGE', entity: 'USER', entityId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, newValue: true },
    }),
    prisma.auditLog.findMany({
      where: { action: 'CRM_FOLLOWUP', entity: 'USER', entityId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, newValue: true },
    }),
  ]);
  return {
    stageOverrides: buildStageOverrideMap(stageLogs),
    followUps: buildFollowUpMap(followLogs),
  };
}

export const getCrmOverview = async () => {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalContacts,
    buyers,
    suppliers,
    newContacts30d,
    completedGmvAgg,
    openNegotiations,
    pendingKyc,
    usersForPipeline,
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: UserRole.ADMIN } } }),
    prisma.user.count({ where: { role: UserRole.BUYER } }),
    prisma.user.count({ where: { role: UserRole.SUPPLIER } }),
    prisma.user.count({
      where: { role: { not: UserRole.ADMIN }, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED },
      _sum: { totalAmount: true },
    }),
    prisma.negotiation.count({ where: { status: { in: OPEN_NEGO_STATUSES } } }),
    prisma.userVerification.count({
      where: { verificationStatus: VerificationStatus.PENDING },
    }),
    prisma.user.findMany({
      where: { role: { not: UserRole.ADMIN } },
      select: { id: true },
      take: 500,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const ids = usersForPipeline.map((u) => u.id);
  const [metricsMap, { stageOverrides }] = await Promise.all([
    getUserMetricsBatch(ids),
    loadCrmMetaMaps(ids),
  ]);
  const pipeline: Record<CrmStage, number> = {
    LEAD: 0,
    PROSPECT: 0,
    ACTIVE: 0,
    VIP: 0,
    AT_RISK: 0,
  };

  for (const id of ids) {
    const m = metricsMap.get(id);
    if (!m) continue;
    const stage = stageOverrides.get(id) ?? computeCrmStage(m);
    pipeline[stage] += 1;
  }

  const dailyLeads = await prisma.$queryRaw<{ x: Date | string; y: number }[]>`
    SELECT DATE(created_at) as x, COUNT(*) as y
    FROM users
    WHERE role != 'ADMIN' AND created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY x ASC
  `;

  const fillDaily = (raw: { x: Date | string; y: number | bigint }[]) => {
    const map = new Map<string, number>();
    for (const row of raw) {
      const key =
        row.x instanceof Date ? row.x.toISOString().split('T')[0] : String(row.x).split('T')[0];
      map.set(key, Number(row.y));
    }
    const out: { x: string; y: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      out.push({ x: key, y: map.get(key) ?? 0 });
    }
    return out;
  };

  return {
    summary: {
      totalContacts,
      buyers,
      suppliers,
      newContacts30d,
      platformGmv: Number(completedGmvAgg._sum.totalAmount ?? 0),
      openNegotiations,
      pendingKyc,
    },
    pipeline,
    dailyLeads: fillDaily(dailyLeads),
  };
};

export const listCrmContacts = async (params: {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  stage?: CrmStage;
}) => {
  const { page, limit, search, role, stage } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    role: role ?? { not: UserRole.ADMIN },
    ...(search && {
      OR: [
        { fullName: { contains: search } },
        { email: { contains: search } },
        { profile: { companyName: { contains: search } } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        tier: true,
        phone: true,
        province: true,
        regency: true,
        createdAt: true,
        updatedAt: true,
        isEmailVerified: true,
        profile: { select: { companyName: true } },
        verification: { select: { verificationStatus: true } },
        _count: {
          select: {
            ordersAsBuyer: true,
            ordersAsSeller: true,
            buyerNegotiations: true,
            sellerNegotiations: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const enrichUsers = async (batch: typeof users) => {
    const ids = batch.map((u) => u.id);
    const [metricsMap, { stageOverrides, followUps }] = await Promise.all([
      getUserMetricsBatch(ids),
      loadCrmMetaMaps(ids),
    ]);
    return batch.map((u) => {
      const m = metricsMap.get(u.id)!;
      const override = stageOverrides.get(u.id) ?? null;
      const computed = computeCrmStage(m);
      const effectiveStage = override ?? computed;
      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        tier: u.tier,
        phone: u.phone,
        province: u.province,
        regency: u.regency,
        companyName: u.profile?.companyName ?? null,
        kycStatus: u.verification?.verificationStatus ?? null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        isEmailVerified: u.isEmailVerified,
        orderCount: u._count.ordersAsBuyer + u._count.ordersAsSeller,
        negotiationCount: u._count.buyerNegotiations + u._count.sellerNegotiations,
        completedOrders: m.completedOrders,
        completedGmv: m.completedGmv,
        lastOrderAt: m.lastOrderAt,
        stage: effectiveStage,
        stageComputed: computed,
        stageOverride: override,
        nextFollowUpAt: followUps.get(u.id) ?? null,
      };
    });
  };

  const items = await enrichUsers(users);

  if (stage) {
    const batch = await prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 300,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        tier: true,
        phone: true,
        province: true,
        regency: true,
        createdAt: true,
        updatedAt: true,
        isEmailVerified: true,
        profile: { select: { companyName: true } },
        verification: { select: { verificationStatus: true } },
        _count: {
          select: {
            ordersAsBuyer: true,
            ordersAsSeller: true,
            buyerNegotiations: true,
            sellerNegotiations: true,
          },
        },
      },
    });
    const filtered = (await enrichUsers(batch)).filter((i) => i.stage === stage);
    const paged = filtered.slice(skip, skip + limit);
    return {
      items: paged,
      pagination: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      },
    };
  }

  return {
    items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getCrmContactDetail = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      tier: true,
      phone: true,
      province: true,
      regency: true,
      jobTitle: true,
      createdAt: true,
      updatedAt: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      profile: true,
      verification: true,
      wallet: { select: { balance: true, totalEarned: true, totalWithdrawn: true } },
      _count: {
        select: { ordersAsBuyer: true, ordersAsSeller: true, products: true },
      },
    },
  });

  if (!user || user.role === UserRole.ADMIN) {
    throw new AppError('Kontak CRM tidak ditemukan', 404);
  }

  const [metricsMap, { stageOverrides, followUps }] = await Promise.all([
    getUserMetricsBatch([userId]),
    loadCrmMetaMaps([userId]),
  ]);
  const m = metricsMap.get(userId)!;
  const override = stageOverrides.get(userId) ?? null;
  const computed = computeCrmStage(m);

  const [recentOrders, recentNegotiations, notes, timelineOrders] = await Promise.all([
    prisma.order.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        buyer: { select: { fullName: true } },
        seller: { select: { fullName: true } },
      },
    }),
    prisma.negotiation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        status: true,
        totalEstimate: true,
        updatedAt: true,
        product: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: 'USER',
        entityId: userId,
        action: { in: ['CRM_NOTE', 'CRM_STAGE', 'CRM_FOLLOWUP'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        action: true,
        newValue: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { createdAt: true },
    }),
  ]);

  return {
    contact: {
      ...user,
      metrics: m,
      stage: override ?? computed,
      stageComputed: computed,
      stageOverride: override,
      nextFollowUpAt: followUps.get(userId) ?? null,
      lastCompletedOrderAt: timelineOrders[0]?.createdAt ?? m.lastOrderAt,
    },
    recentOrders,
    recentNegotiations,
    notes: notes.map((n) => ({
      id: n.id,
      action: n.action,
      content:
        n.action === 'CRM_NOTE'
          ? (n.newValue as { content?: string })?.content
          : JSON.stringify(n.newValue),
      authorName: n.user?.fullName ?? 'Admin',
      createdAt: n.createdAt,
    })),
  };
};

export const createCrmNote = async (
  userId: string,
  adminId: string,
  data: { content: string; noteType?: string },
) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role === UserRole.ADMIN) {
    throw new AppError('Kontak tidak ditemukan', 404);
  }

  const content = data.content.trim();
  if (!content) throw new AppError('Catatan tidak boleh kosong', 400);

  const note = await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: 'CRM_NOTE',
      entity: 'USER',
      entityId: userId,
      newValue: { content, noteType: data.noteType ?? 'NOTE' },
    },
    select: {
      id: true,
      action: true,
      newValue: true,
      createdAt: true,
      user: { select: { fullName: true } },
    },
  });

  return {
    id: note.id,
    action: note.action,
    content: (note.newValue as { content: string }).content,
    authorName: note.user?.fullName ?? 'Admin',
    createdAt: note.createdAt,
  };
};

export const updateCrmContact = async (
  userId: string,
  adminId: string,
  data: { stage?: CrmStage; nextFollowUpAt?: string | null; priority?: string },
) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role === UserRole.ADMIN) {
    throw new AppError('Kontak tidak ditemukan', 404);
  }

  if (data.stage) {
    if (!CRM_STAGES.includes(data.stage)) {
      throw new AppError('Stage CRM tidak valid', 400);
    }
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CRM_STAGE',
        entity: 'USER',
        entityId: userId,
        newValue: { stage: data.stage, priority: data.priority },
      },
    });
  }

  if (data.nextFollowUpAt !== undefined) {
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CRM_FOLLOWUP',
        entity: 'USER',
        entityId: userId,
        newValue: { nextFollowUpAt: data.nextFollowUpAt },
      },
    });
  }

  const [metricsMap, { stageOverrides, followUps }] = await Promise.all([
    getUserMetricsBatch([userId]),
    loadCrmMetaMaps([userId]),
  ]);
  const m = metricsMap.get(userId)!;
  const override = stageOverrides.get(userId) ?? null;

  return {
    stage: override ?? computeCrmStage(m),
    nextFollowUpAt: followUps.get(userId) ?? null,
  };
};
