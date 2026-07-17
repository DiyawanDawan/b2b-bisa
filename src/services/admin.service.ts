import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  Prisma,
  OrderStatus,
  DisputeStatus,
  UserStatus,
  ProductStatus,
  VerificationStatus,
  TransactionStatus,
  TransactionType,
  PaymentStatus,
  UserRole,
  PlatformFeeType,
  FeeCalculationType,
  CATEGORY_TYPE,
  NotificationType,
  NotificationPriority,
  PayoutStatus,
} from '#prisma';
import { createNotification } from '#services/notification.service';
import { notifyOrderStatusChange } from '#services/orderNotification.service';
import { invalidateCategories } from '#utils/cache.util';
import { decryptField, isEncryptedPayload } from '#utils/encryption.util';
import { formatPayoutAccountForAdmin } from '#utils/payoutAccount.util';
import { maskNPWP } from '#utils/sensitiveData.util';
import { getUserReadiness } from '#utils/readiness.util';
import {
  buildDisputeMediationMeta,
  countAdminMediationMessages,
  ensureDisputeNegotiationRoom,
  ensureOrderDisputeRecord,
  postDisputeResolvedChatMessage,
} from '#services/dispute-mediation.service';
import {
  attemptXenditRefundForTransaction,
  executeDisputeRefundInTx,
  executeDisputeReleaseInTx,
} from '#services/wallet.service';
import { attachProductMediaUrls } from '#utils/productMedia.util';
import { attachUserMediaUrls, resolveMediaField } from '#utils/mediaResolver.util';
import * as storageService from '#services/storage.service';

interface ChartDataRow {
  x: Date | string | number;
  y: number | string | null;
}

/**
 * Service to handle administrative analytics & dashboard stats
 */

/**
 * Get high-level summary stats for the admin dashboard
 */
export const getDashboardStats = async () => {
  const [userCount, orderCount, gmvResult, disputeCount, biomassResult] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED },
      _sum: { totalAmount: true },
    }),
    prisma.order.count({
      where: { status: OrderStatus.DISPUTED },
    }),
    prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED },
      _sum: { totalQuantity: true },
    }),
  ]);

  return {
    totalUsers: userCount,
    totalOrders: orderCount,
    totalGMV: gmvResult._sum.totalAmount || 0,
    activeDisputes: disputeCount,
    totalBiomassTons: biomassResult._sum.totalQuantity || 0,
  };
};

export const getBiomassTrend = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Optimized Raw SQL for MariaDB/MySQL to group by day at DB level
  const rawData = (await prisma.$queryRaw`
    SELECT DATE(created_at) as x, SUM(total_quantity) as y
    FROM orders
    WHERE status = ${OrderStatus.COMPLETED}
      AND created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY x ASC
  `) as ChartDataRow[];

  return rawData.map((row) => ({
    x: row.x instanceof Date ? row.x.toISOString().split('T')[0] : row.x,
    y: Number(row.y || 0),
  }));
};

/**
 * Get Revenue Analytics over time (Monthly for the last 12 months) for Area Chart
 */
export const getRevenueAnalytics = async () => {
  const oneYearAgo = new Date();
  oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);

  // Optimized Raw SQL for MariaDB/MySQL to group by month at DB level
  const rawData = (await prisma.$queryRaw`
    SELECT DATE_FORMAT(created_at, '%Y-%m') as x, SUM(total_amount) as y
    FROM orders
    WHERE status = ${OrderStatus.COMPLETED}
      AND created_at >= ${oneYearAgo}
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY x ASC
  `) as ChartDataRow[];

  return {
    series: [
      {
        name: 'Revenue',
        data: rawData.map((row) => ({
          x: row.x,
          y: Number(row.y || 0),
        })),
      },
    ],
  };
};

/**
 * Get User Analytics (Demographics by Role & Status) for Donut Chart
 */
export const getUserAnalytics = async () => {
  const [roleDistribution, statusDistribution] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      _count: { id: true },
    }),
    prisma.user.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
  ]);

  return {
    roles: {
      labels: roleDistribution.map((item) => item.role),
      series: roleDistribution.map((item) => item._count.id),
    },
    statuses: {
      labels: statusDistribution.map((item) => item.status),
      series: statusDistribution.map((item) => item._count.id),
    },
  };
};

type UserDailyRow = { x: Date | string; y: number | string | null };

function fillUserDailySeries(raw: UserDailyRow[], days = 30): { x: string; y: number }[] {
  const map = new Map<string, number>();
  for (const row of raw) {
    const key =
      row.x instanceof Date ? row.x.toISOString().split('T')[0] : String(row.x).split('T')[0];
    map.set(key, Number(row.y ?? 0));
  }
  const out: { x: string; y: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    out.push({ x: key, y: map.get(key) ?? 0 });
  }
  return out;
}

/**
 * Statistik lengkap untuk halaman admin pengguna (chart & KPI).
 */
export const getUserAnalyticsStats = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAgo = new Date();
  oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    roleDistribution,
    statusDistribution,
    kycDistribution,
    dailySignupRaw,
    monthlySignupRaw,
    totalUsers,
    activeUsers,
    blockedUsers,
    suppliers,
    buyers,
    admins,
    pendingKyc,
    verifiedKyc,
    rejectedKyc,
    thisMonthUsers,
    emailVerified,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
    prisma.user.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.userVerification.groupBy({
      by: ['verificationStatus'],
      _count: { id: true },
    }),
    prisma.$queryRaw<UserDailyRow[]>`
      SELECT DATE(created_at) as x, COUNT(*) as y
      FROM users
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY x ASC
    `,
    prisma.$queryRaw<UserDailyRow[]>`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as x, COUNT(*) as y
      FROM users
      WHERE created_at >= ${oneYearAgo}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY x ASC
    `,
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { status: UserStatus.BLOCKED } }),
    prisma.user.count({ where: { role: UserRole.SUPPLIER } }),
    prisma.user.count({ where: { role: UserRole.BUYER } }),
    prisma.user.count({ where: { role: UserRole.ADMIN } }),
    prisma.userVerification.count({
      where: { verificationStatus: VerificationStatus.PENDING },
    }),
    prisma.userVerification.count({
      where: { verificationStatus: VerificationStatus.VERIFIED },
    }),
    prisma.userVerification.count({
      where: { verificationStatus: VerificationStatus.REJECTED },
    }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { isEmailVerified: true } }),
  ]);

  return {
    summary: {
      totalUsers,
      activeUsers,
      blockedUsers,
      suppliers,
      buyers,
      admins,
      pendingKyc,
      verifiedKyc,
      rejectedKyc,
      thisMonthUsers,
      emailVerified,
    },
    roles: roleDistribution.map((r) => ({ role: r.role, count: r._count.id })),
    statuses: statusDistribution.map((s) => ({ status: s.status, count: s._count.id })),
    kyc: kycDistribution.map((k) => ({
      status: k.verificationStatus,
      count: k._count.id,
    })),
    dailySignups: fillUserDailySeries(dailySignupRaw),
    monthlySignups: monthlySignupRaw.map((row) => ({
      x: String(row.x),
      y: Number(row.y ?? 0),
    })),
  };
};

/**
 * Get Product Category Mix for Radar or Pie Chart
 */
export const getCategoryAnalytics = async () => {
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: {
          products: { where: { status: ProductStatus.ACTIVE } },
        },
      },
    },
  });

  return {
    labels: categories.map((c) => c.name),
    series: categories.map((c) => c._count.products),
  };
};

/**
 * Get Top Suppliers by Transaction Volume for Bar Chart
 */
export const getTopSuppliers = async () => {
  const topSellers = await prisma.order.groupBy({
    by: ['sellerId'],
    where: { status: OrderStatus.COMPLETED },
    _sum: { totalAmount: true },
    orderBy: { _sum: { totalAmount: 'desc' } },
    take: 5,
  });

  const sellerIds = topSellers.map((s) => s.sellerId);
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, fullName: true },
  });

  const labels: string[] = [];
  const series: number[] = [];

  topSellers.forEach((stat) => {
    const user = sellers.find((s) => s.id === stat.sellerId);
    if (user) {
      labels.push(user.fullName || 'Unknown');
      series.push(Number(stat._sum.totalAmount || 0));
    }
  });

  return { labels, series: [{ name: 'Volume', data: series }] };
};

/**
 * KPI platform untuk dashboard admin (produk, toko, forum).
 */
export const getDashboardPlatformAnalytics = async () => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    productsByStatus,
    totalProducts,
    activeProducts,
    certifiedProducts,
    productsThisMonth,
    totalStoreBanners,
    activeStoreBanners,
    suppliersWithBanner,
    activeSuppliers,
    publishedForumPosts,
    pendingKyc,
  ] = await Promise.all([
    prisma.product.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.product.count(),
    prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
    prisma.product.count({
      where: { status: ProductStatus.ACTIVE, isCertified: true },
    }),
    prisma.product.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.storeBanner.count(),
    prisma.storeBanner.count({ where: { isActive: true } }),
    prisma.user.count({
      where: {
        role: UserRole.SUPPLIER,
        storeBanners: { some: { isActive: true } },
      },
    }),
    prisma.user.count({
      where: { role: UserRole.SUPPLIER, status: UserStatus.ACTIVE },
    }),
    prisma.forumPost.count({ where: { status: 'PUBLISHED' } }),
    prisma.userVerification.count({
      where: { verificationStatus: VerificationStatus.PENDING },
    }),
  ]);

  return {
    summary: {
      totalProducts,
      activeProducts,
      certifiedProducts,
      productsThisMonth,
      totalStoreBanners,
      activeStoreBanners,
      suppliersWithBanner,
      activeSuppliers,
      publishedForumPosts,
      pendingKyc,
    },
    productsByStatus: productsByStatus.map((row) => ({
      status: row.status,
      count: row._count.id,
    })),
  };
};

type VisualGalleryProduct = {
  id: string;
  name: string;
  status: ProductStatus;
  pricePerUnit: unknown;
  createdAt: Date;
  thumbnailUrl: string | null;
  supplierName: string;
  supplierAvatarUrl: string | null;
};

/**
 * Galeri visual dashboard — produk, banner toko, supplier, forum.
 */
export const getDashboardVisualGallery = async () => {
  const [rawProducts, rawBanners, rawSuppliers, rawForumPosts] = await Promise.all([
    prisma.product.findMany({
      take: 12,
      orderBy: { createdAt: 'desc' },
      where: {
        status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
        images: { some: {} },
      },
      select: {
        id: true,
        name: true,
        status: true,
        pricePerUnit: true,
        createdAt: true,
        thumbnailUrl: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }],
          take: 1,
          select: { url: true },
        },
        user: { select: { fullName: true, avatarUrl: true } },
      },
    }),
    prisma.storeBanner.findMany({
      take: 10,
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        imageUrl: true,
        sortOrder: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            profile: { select: { companyName: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      take: 10,
      where: { role: UserRole.SUPPLIER, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        profile: { select: { companyName: true } },
        _count: { select: { products: true, storeBanners: true } },
      },
    }),
    prisma.forumPost.findMany({
      take: 8,
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        mediaUrls: true,
        createdAt: true,
        user: { select: { fullName: true, avatarUrl: true } },
      },
    }),
  ]);

  const products: VisualGalleryProduct[] = rawProducts.map((p) => {
    const mapped = attachProductMediaUrls({ ...p });
    const user = p.user ? attachUserMediaUrls({ ...p.user }) : null;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      pricePerUnit: p.pricePerUnit,
      createdAt: p.createdAt,
      thumbnailUrl: mapped.thumbnailUrl ?? null,
      supplierName: user?.fullName ?? 'Supplier',
      supplierAvatarUrl: user?.avatarUrl ?? null,
    };
  });

  const storeBanners = rawBanners.map((b) => {
    const user = attachUserMediaUrls({ ...b.user });
    return {
      id: b.id,
      title: b.title,
      imageUrl: resolveMediaField(b.imageUrl) ?? b.imageUrl,
      sortOrder: b.sortOrder,
      createdAt: b.createdAt,
      storeName: user.profile?.companyName ?? user.fullName,
      supplierId: user.id,
      supplierAvatarUrl: user.avatarUrl ?? null,
    };
  });

  const supplierStores = rawSuppliers.map((s) => {
    const user = attachUserMediaUrls({ ...s });
    return {
      id: user.id,
      fullName: user.fullName,
      companyName: user.profile?.companyName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      productCount: s._count.products,
      bannerCount: s._count.storeBanners,
    };
  });

  const forumMedia = rawForumPosts
    .map((post) => {
      const urls = Array.isArray(post.mediaUrls)
        ? (post.mediaUrls as string[]).map((u) => resolveMediaField(u) ?? u).filter(Boolean)
        : [];
      if (urls.length === 0) return null;
      const author = post.user ? attachUserMediaUrls({ ...post.user }) : null;
      return {
        id: post.id,
        title: post.title,
        imageUrl: urls[0],
        mediaCount: urls.length,
        createdAt: post.createdAt,
        authorName: author?.fullName ?? 'Member',
        authorAvatarUrl: author?.avatarUrl ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    products,
    storeBanners,
    supplierStores,
    forumMedia,
  };
};

/**
 * List all users with pagination and filtering
 */
export const listUsers = async (params: {
  page: number;
  limit: number;
  role?: UserRole;
  status?: UserStatus;
  tier?: string;
  search?: string;
}) => {
  const { page, limit, role, status, tier, search } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (tier) where.tier = tier;
  if (search) {
    where.OR = [{ email: { startsWith: search } }, { fullName: { startsWith: search } }];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        tier: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        avatarUrl: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const mappedUsers = users.map((user) => ({
    ...user,
    avatarUrl: storageService.toMediaResponsePath(user.avatarUrl),
  }));

  return {
    users: mappedUsers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get 360-degree view of a user for audit
 */
export const getUserDossier = async (
  userId: string,
  options: { unmaskPayoutAccounts?: boolean } = {},
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      role: true,
      status: true,
      tier: true,
      subscriptionExpiresAt: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      province: true,
      regency: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
      profile: {
        select: {
          bio: true,
          website: true,
          companyName: true,
          npwp: true,
          businessType: true,
          rajaongkirOriginId: true,
          rajaongkirOriginLabel: true,
        },
      },
      wallet: {
        select: {
          id: true,
          balance: true,
          totalEarned: true,
          totalWithdrawn: true,
          updatedAt: true,
        },
      },
      payoutAccounts: {
        select: {
          id: true,
          bankId: true,
          accountNumber: true,
          accountName: true,
          isMain: true,
          createdAt: true,
          bank: { select: { id: true, name: true, code: true } },
        },
      },
      verification: {
        select: {
          verificationStatus: true,
          isVerified: true,
          ktpUrl: true,
          selfieUrl: true,
          updatedAt: true,
        },
      },
      _count: {
        select: {
          ordersAsBuyer: true,
          ordersAsSeller: true,
          products: true,
        },
      },
    },
  });

  if (!user) throw new AppError('User tidak ditemukan', 404);

  const revealNpwp = (stored?: string | null): string => {
    if (!stored) return '';
    if (isEncryptedPayload(stored)) return decryptField(stored);
    return stored;
  };

  const profile = {
    ...user,
    avatarUrl: storageService.toMediaResponsePath(user.avatarUrl),
    profile: user.profile
      ? {
          ...user.profile,
          npwp: user.profile.npwp ? maskNPWP(revealNpwp(user.profile.npwp)) : null,
        }
      : null,
    verification: user.verification
      ? {
          ...user.verification,
          ktpUrl: resolveMediaField(user.verification.ktpUrl),
          selfieUrl: resolveMediaField(user.verification.selfieUrl),
        }
      : null,
    payoutAccounts: user.payoutAccounts.map((account) =>
      formatPayoutAccountForAdmin(
        account,
        { userId, bankId: account.bankId },
        options.unmaskPayoutAccounts,
      ),
    ),
  };

  // Fetch recent activity (last 5 orders)
  const recentOrders = await prisma.order.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      createdAt: true,
    },
  });

  const readiness = await getUserReadiness(userId);

  return {
    profile,
    stats: {
      totalBuyerOrders: user._count.ordersAsBuyer,
      totalSellerOrders: user._count.ordersAsSeller,
      totalProducts: user._count.products,
    },
    recentOrders,
    readiness,
  };
};

/**
 * Update user account status (Ban/Unban)
 */
export const updateUserStatus = async (userId: string, status: UserStatus) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('Data member tidak ditemukan.', 404);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { status },
    select: { id: true, email: true, status: true },
  });
};

/**
 * List Pending KYC Document Verifications
 */
export const listKYCQueue = async (params: {
  page: number;
  limit: number;
  status?: VerificationStatus;
}) => {
  const { page, limit, status } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (status) where.verificationStatus = status;
  else where.verificationStatus = VerificationStatus.PENDING;

  const [queue, total] = await Promise.all([
    prisma.userVerification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true } },
      },
    }),
    prisma.userVerification.count({ where }),
  ]);

  const mappedQueue = queue.map((row) => ({
    ...row,
    ktpUrl: resolveMediaField(row.ktpUrl),
    selfieUrl: resolveMediaField(row.selfieUrl),
    nibUrl: resolveMediaField(row.nibUrl),
    siupUrl: resolveMediaField(row.siupUrl),
  }));

  return {
    queue: mappedQueue,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * List all products for moderation
 */
export const listAllProducts = async (params: {
  page: number;
  limit: number;
  status?: ProductStatus;
  search?: string;
}) => {
  const { page, limit, status, search } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) {
    where.name = { startsWith: search };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true } },
        category: { select: { name: true } },
        // For fallback thumbnail resolution (and to provide richer data if needed later).
        images: { select: { url: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const mappedProducts = products.map((p) => {
    const mapped = attachProductMediaUrls({ ...p });
    return {
      ...p,
      // Ensure frontend can render directly (public URL instead of stored path).
      thumbnailUrl: mapped.thumbnailUrl ?? null,
    };
  });

  return {
    products: mappedProducts,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Verify / Certify a product
 */
export const verifyProduct = async (productId: string, isCertified: boolean) => {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, isCertified: true, name: true },
  });

  if (!existing) {
    throw new AppError('Produk tidak ditemukan', 404);
  }

  const include = {
    user: { select: { fullName: true, email: true } },
    category: { select: { name: true } },
  } as const;

  if (existing.isCertified === isCertified) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include,
    });
    return { product, previousIsCertified: existing.isCertified, changed: false };
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: { isCertified },
    include,
  });

  return { product, previousIsCertified: existing.isCertified, changed: true };
};

/**
 * Global Transaction Ledger Audit
 */
export const listTransactions = async (params: {
  page: number;
  limit: number;
  type?: TransactionType;
  status?: TransactionStatus;
  search?: string;
}) => {
  const { page, limit, type, status, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.TransactionWhereInput = {
    ...(type && { type }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { externalId: { startsWith: search } },
        { order: { orderNumber: { startsWith: search } } },
        { user: { fullName: { startsWith: search } } },
        { user: { email: { startsWith: search } } },
      ],
    }),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { orderNumber: true } },
        user: { select: { fullName: true, email: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * List all disputed orders with pagination
 */
export const listDisputes = async (params: {
  page: number;
  limit: number;
  search?: string;
  statusFilter?: OrderStatus;
}) => {
  const { page, limit, search, statusFilter } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.OrderWhereInput = {
    status: statusFilter || OrderStatus.DISPUTED,
    ...(search && {
      OR: [
        { orderNumber: { startsWith: search } },
        { buyer: { fullName: { startsWith: search } } },
        { seller: { fullName: { startsWith: search } } },
      ],
    }),
  };

  const [disputes, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        buyer: { select: { fullName: true, avatarUrl: true } },
        seller: { select: { fullName: true, avatarUrl: true } },
        negotiation: { select: { id: true } },
        dispute: true,
        items: {
          take: 1,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                thumbnailUrl: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  const disputesWithMediation = await Promise.all(
    disputes.map(async (order) => {
      let negotiation = order.negotiation;
      if (!negotiation && order.dispute) {
        const room = await ensureDisputeNegotiationRoom(order.id);
        negotiation = { id: room.id };
      }

      const items = order.items.map((item) => {
        const product = item.product
          ? attachProductMediaUrls({ ...item.product })
          : null;
        return {
          ...item,
          product: product
            ? {
                id: product.id,
                name: product.name,
                thumbnailUrl: product.thumbnailUrl ?? null,
              }
            : null,
        };
      });

      const buyer = attachUserMediaUrls({ ...order.buyer });
      const seller = attachUserMediaUrls({ ...order.seller });

      return {
        ...order,
        buyer: {
          fullName: buyer.fullName,
          avatarUrl: buyer.avatarUrl ?? null,
        },
        seller: {
          fullName: seller.fullName,
          avatarUrl: seller.avatarUrl ?? null,
        },
        items,
        negotiation,
        mediation: await buildDisputeMediationMeta({
          id: order.id,
          status: order.status,
          negotiation: negotiation ? { id: negotiation.id } : null,
          dispute: order.dispute,
        }),
      };
    }),
  );

  return {
    disputes: disputesWithMediation,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Resolve Order Dispute (Release or Refund) — moves escrow funds, not label-only.
 */
export const resolveDispute = async (
  orderId: string,
  resolution: 'RELEASE' | 'REFUND',
  note: string,
  adminId: string,
) => {
  // NOTE: Type inference di jalur refund kadang menyimpulkan `never` (problem narrowing/conditional return type).
  // Kita hanya butuh payload untuk Xendit refund; cast tipe di sini agar TS tidak blok build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let refundTransaction: any = null;

  const result = await prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          transaction: true,
          dispute: true,
          negotiation: { select: { id: true } },
        },
      });

      if (!order) throw new AppError('Order tidak ditemukan', 404);
      if (order.status !== OrderStatus.DISPUTED)
        throw new AppError('Order tidak dalam status sengketa', 400);
      if (!order.dispute) throw new AppError('Data sengketa tidak ditemukan', 404);
      if (order.dispute.status === DisputeStatus.RESOLVED) {
        throw new AppError('Sengketa sudah diselesaikan sebelumnya.', 409);
      }

      if (!order.dispute.mediationStartedAt) {
        throw new AppError(
          'Mediasi belum dimulai. Admin harus memulai mediasi di chat sebelum menyelesaikan sengketa.',
          400,
        );
      }
      if (!order.dispute.readyToResolveAt) {
        throw new AppError('Tandai mediasi sebagai siap putus sebelum release atau refund.', 400);
      }
      if (!order.negotiation) {
        const room = await ensureDisputeNegotiationRoom(orderId, tx);
        order.negotiation = { id: room.id };
      }

      const adminMessageCount = await countAdminMediationMessages(order.negotiation.id);
      if (adminMessageCount === 0) {
        throw new AppError(
          'Kirim minimal satu pesan mediasi sebagai Hakim BISA sebelum resolve.',
          400,
        );
      }

      if (!order.transaction) {
        throw new AppError('Tidak ada transaksi escrow untuk pesanan ini.', 400);
      }
      if (order.transaction.status !== TransactionStatus.ESCROW_HELD) {
        throw new AppError(
          'Dana escrow tidak dapat diproses karena status transaksi bukan ESCROW_HELD.',
          409,
        );
      }

      const escrowCtx = {
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        transaction: {
          id: order.transaction.id,
          status: order.transaction.status,
          sellerAmount: order.transaction.sellerAmount,
          amount: order.transaction.amount,
          paymentRequestId: order.transaction.paymentRequestId,
          xenditInvoiceId: order.transaction.xenditInvoiceId,
          paymentStatus: order.transaction.paymentStatus,
        },
      };

      let updatedOrder;
      let releasedSellerAmount: Prisma.Decimal | null = null;
      if (resolution === 'RELEASE') {
        const releaseResult = await executeDisputeReleaseInTx(tx, escrowCtx);
        updatedOrder = releaseResult.order;
        releasedSellerAmount = releaseResult.sellerAmount;
      } else {
        refundTransaction = await executeDisputeRefundInTx(tx, escrowCtx);
        updatedOrder = await tx.order.findUnique({ where: { id: orderId } });
      }

      const disputeUpdate = await tx.orderDispute.updateMany({
        where: { orderId, status: { not: DisputeStatus.RESOLVED } },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution,
          resolutionNote: note,
          resolvedAt: new Date(),
          resolvedById: adminId,
        },
      });

      if (disputeUpdate.count === 0) {
        throw new AppError('Sengketa sudah diselesaikan sebelumnya.', 409);
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'RESOLVE_DISPUTE',
          entity: 'ORDER',
          entityId: orderId,
          newValue: { resolution, note, prevStatus: order.status },
        },
      });

      return {
        updatedOrder: updatedOrder!,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        orderNumber: order.orderNumber,
        releasedSellerAmount,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );

  if (refundTransaction) {
    // TS kadang menyimpulkan tipe `never` di jalur after-narrowing,
    // padahal runtime value punya shape yang dibutuhkan Xendit refund.
    const rt = refundTransaction as any;
    await attemptXenditRefundForTransaction(
      {
        paymentRequestId: rt.paymentRequestId,
        xenditInvoiceId: rt.xenditInvoiceId,
        amount: rt.amount,
        paymentStatus: rt.paymentStatus ?? PaymentStatus.PENDING,
      },
      'DISPUTE_REFUND',
    );
  }

  if (resolution === 'RELEASE') {
    void notifyOrderStatusChange({
      buyerId: result.buyerId,
      sellerId: result.sellerId,
      orderId,
      orderNumber: result.orderNumber,
      status: 'COMPLETED',
    });

    if (result.releasedSellerAmount) {
      void createNotification({
        userId: result.sellerId,
        title: 'Dana Sengketa Dilepas',
        body: `Escrow pesanan ${result.orderNumber} sebesar Rp ${Number(result.releasedSellerAmount).toLocaleString('id-ID')} telah masuk ke dompet Anda.`,
        type: NotificationType.DISPUTE,
        priority: NotificationPriority.HIGH,
        refId: orderId,
      }).catch(() => {});
    }
  }

  const resolutionLabel =
    resolution === 'RELEASE' ? 'dana dilepas ke supplier' : 'dana direfund ke pembeli';
  const notifyBody = `Sengketa pesanan ${result.orderNumber} diselesaikan: ${resolutionLabel}.`;

  void createNotification({
    userId: result.buyerId,
    title: 'Sengketa Diselesaikan',
    body: notifyBody,
    type: NotificationType.DISPUTE,
    priority: NotificationPriority.HIGH,
    refId: orderId,
  }).catch(() => {});

  void createNotification({
    userId: result.sellerId,
    title: 'Sengketa Diselesaikan',
    body: notifyBody,
    type: NotificationType.DISPUTE,
    priority: NotificationPriority.HIGH,
    refId: orderId,
  }).catch(() => {});

  await postDisputeResolvedChatMessage(orderId, adminId, resolution, note);

  return result.updatedOrder;
};

/**
 * Get detailed dispute evidence (photos, chat history context)
 */
export const getDisputeDetail = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
setalh itu commit push

    negotiation,
    negotiationId: mediation.negotiationId,
    mediation,
  };
};

/**
 * Detailed Finance Stats for Income Monitoring
 */
export const getFinanceStats = async () => {
  const [escrowHeld, released, refunded, feeSetting] = await Promise.all([
    prisma.transaction.aggregate({
      where: { status: TransactionStatus.ESCROW_HELD },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { status: TransactionStatus.RELEASED },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { status: TransactionStatus.REFUNDED },
      _sum: { amount: true },
    }),
    prisma.platformFeeSetting.findFirst({
      where: { name: PlatformFeeType.TRANSACTION_FEE, isActive: true },
    }),
  ]);

  const feePercent = feeSetting
    ? feeSetting.type === FeeCalculationType.PERCENTAGE
      ? Number(feeSetting.amount) / 100
      : 0
    : 0.03;

  return {
    totalInEscrow: escrowHeld._sum.amount || 0,
    totalReleased: released._sum.amount || 0,
    totalRefunded: refunded._sum.amount || 0,
    platformRevenue: Number(released._sum.amount || 0) * feePercent,
  };
};

const PRODUCT_STATUS_NOTIFY: Partial<
  Record<ProductStatus, { title: string; priority: NotificationPriority }>
> = {
  [ProductStatus.BLOCKED]: {
    title: 'Produk diblokir',
    priority: NotificationPriority.HIGH,
  },
  [ProductStatus.INACTIVE]: {
    title: 'Produk dinonaktifkan',
    priority: NotificationPriority.MEDIUM,
  },
  [ProductStatus.DRAFT]: {
    title: 'Produk dikembalikan ke draft',
    priority: NotificationPriority.MEDIUM,
  },
  [ProductStatus.OUT_OF_STOCK]: {
    title: 'Produk ditandai habis',
    priority: NotificationPriority.LOW,
  },
  [ProductStatus.DELETED]: {
    title: 'Produk dihapus dari listing',
    priority: NotificationPriority.HIGH,
  },
};

/**
 * Moderasi status listing produk (dengan alasan untuk status restriktif).
 */
export const moderateProductStatus = async (
  productId: string,
  status: ProductStatus,
  options: { reason?: string; adminUserId: string },
) => {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, name: true, userId: true },
  });

  if (!existing) {
    throw new AppError('Produk tidak ditemukan', 404);
  }

  const reason = options.reason?.trim();
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { status },
  });

  const notifyMeta = PRODUCT_STATUS_NOTIFY[status];
  if (notifyMeta && reason) {
    void createNotification({
      userId: existing.userId,
      title: notifyMeta.title,
      body: `Listing "${existing.name}" dimoderasi admin. Alasan: ${reason}`,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      priority: notifyMeta.priority,
      refId: productId,
    });
  }

  return {
    product: updated,
    previousStatus: existing.status,
    reason: reason ?? null,
  };
};

/**
 * List all Platform Fee settings
 */
export const listPlatformFees = async () => {
  return prisma.platformFeeSetting.findMany({
    orderBy: { name: 'asc' },
  });
};

/**
 * Update a specific Platform Fee
 */
export const updatePlatformFee = async (
  id: string,
  data: { amount: number; isActive: boolean },
) => {
  return prisma.platformFeeSetting.update({
    where: { id },
    data: {
      amount: data.amount,
      isActive: data.isActive,
    },
  });
};

/**
 * Create a new Platform Fee
 */
export const createPlatformFee = async (data: {
  name: PlatformFeeType;
  amount: number;
  type: FeeCalculationType;
  description?: string;
  isActive?: boolean;
}) => {
  return prisma.platformFeeSetting.create({
    data,
  });
};
/**
 * Categories management
 */
export const listCategories = async () => {
  return prisma.category.findMany({
    orderBy: { name: 'asc' },
  });
};

export const createCategory = async (data: {
  name: string;
  description?: string;
  categoryType: CATEGORY_TYPE;
}) => {
  const created = await prisma.category.create({
    data,
  });
  void invalidateCategories();
  return created;
};

export const updateCategory = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    categoryType?: CATEGORY_TYPE;
  },
) => {
  const updated = await prisma.category.update({
    where: { id },
    data,
  });
  void invalidateCategories();
  return updated;
};

/**
 * Audit Logging Helper
 */
export const createAuditLog = async (params: {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
}) => {
  return prisma.auditLog.create({
    data: params,
  });
};
/**
 * Phase 5 Extensions
 */

/**
 * Create a system broadcast notification to all users or a specific role
 */
export const createBroadcast = async (
  data: {
    title: string;
    message: string;
    priority: NotificationPriority;
    targetRole?: UserRole;
  },
  adminId: string,
) => {
  const { title, message, priority, targetRole } = data;

  const users = await prisma.user.findMany({
    where: targetRole
      ? { role: targetRole, status: UserStatus.ACTIVE }
      : { status: UserStatus.ACTIVE },
    select: { id: true },
  });

  const notifications = users.map((u) => ({
    userId: u.id,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title,
    body: message,
    priority,
  }));

  // Chunking to prevent MySQL packet size issues (Step of 1000)
  const chunkSize = 1000;
  for (let i = 0; i < notifications.length; i += chunkSize) {
    const chunk = notifications.slice(i, i + chunkSize);
    await prisma.notification.createMany({
      data: chunk,
    });
  }

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_BROADCAST',
    entity: 'NOTIFICATION',
    newValue: {
      title,
      message: message.length > 200 ? `${message.slice(0, 200)}…` : message,
      priority,
      targetRole: targetRole ?? null,
      userCount: users.length,
    },
  });

  return { success: true, count: users.length };
};

export const getNotificationAdminStats = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    totalNotifications,
    unreadNotifications,
    systemAnnouncements7d,
    activeUsers,
    pushDevices,
    broadcastCount,
  ] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.notification.count({
      where: {
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, role: { not: UserRole.ADMIN } } }),
    prisma.userDevice.count({ where: { isActive: true } }),
    prisma.auditLog.count({ where: { action: 'CREATE_BROADCAST' } }),
  ]);

  const byPriority = await prisma.notification.groupBy({
    by: ['priority'],
    _count: { id: true },
    where: { createdAt: { gte: sevenDaysAgo } },
  });

  return {
    totalNotifications,
    unreadNotifications,
    systemAnnouncements7d,
    activeUsers,
    pushDevices,
    broadcastCount,
    byPriority: byPriority.map((p) => ({
      priority: p.priority,
      count: p._count.id,
    })),
  };
};

export const listBroadcastHistory = async (params: { page: number; limit: number }) => {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'CREATE_BROADCAST', entity: 'NOTIFICATION' },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.auditLog.count({
      where: { action: 'CREATE_BROADCAST', entity: 'NOTIFICATION' },
    }),
  ]);

  const items = logs.map((log) => {
    const val = log.newValue as {
      title?: string;
      message?: string;
      priority?: string;
      targetRole?: string | null;
      userCount?: number;
    } | null;
    return {
      id: log.id,
      title: val?.title ?? '—',
      messagePreview: val?.message ?? null,
      priority: val?.priority ?? 'MEDIUM',
      targetRole: val?.targetRole ?? null,
      recipientCount: val?.userCount ?? 0,
      sentAt: log.createdAt,
      sentBy: log.user,
    };
  });

  return {
    items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * List Payout/Withdrawal Queue
 */
export const getPayoutQueue = async (params: { page: number; limit: number }) => {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: TransactionType.PAYOUT },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true } },
        payoutAccount: { include: { bank: true } },
      },
    }),
    prisma.transaction.count({ where: { type: TransactionType.PAYOUT } }),
  ]);

  const maskedTransactions = transactions.map((trx) => {
    if (!trx.payoutAccount) return trx;
    return {
      ...trx,
      payoutAccount: formatPayoutAccountForAdmin(
        trx.payoutAccount,
        { userId: trx.userId, bankId: trx.payoutAccount.bankId },
        false,
      ),
    };
  });

  return {
    transactions: maskedTransactions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Process a Payout (Complete or Fail)
 */
export const processPayout = async (
  transactionId: string,
  status: 'COMPLETED' | 'FAILED',
  note: string | undefined,
  adminId: string,
) => {
  return prisma.$transaction(async (tx) => {
    const trx = await tx.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!trx) throw new AppError('Transaksi tidak ditemukan', 404);
    if (trx.type !== TransactionType.PAYOUT)
      throw new AppError('Bukan merupakan transaksi penarikan', 400);

    // SECURITY GUARD: Ensure transaction is still PENDING to avoid double processing
    if (trx.status !== TransactionStatus.PENDING) {
      throw new AppError('Transaksi penarikan dana sudah diproses sebelumnya.', 409);
    }

    // Update Transaction Status

    const updatedTrx = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status:
          status === PayoutStatus.COMPLETED ? TransactionStatus.RELEASED : TransactionStatus.FAILED,
      },
    });

    // If failed, refund wallet balance
    if (status === PayoutStatus.FAILED && trx.userId) {
      await tx.wallet.update({
        where: { userId: trx.userId },
        data: {
          balance: { increment: trx.amount },
          totalWithdrawn: { decrement: trx.amount },
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'PROCESS_PAYOUT',
        entity: 'TRANSACTION',
        entityId: transactionId,
        newValue: { status, note },
      },
    });

    return updatedTrx;
  });
};

/**
 * Get simple transaction data for CSV export
 */
export const getExportableTransactions = async (startDate: string, endDate: string) => {
  return prisma.transaction.findMany({
    where: {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      type: true,
      status: true,
      createdAt: true,
      user: { select: { fullName: true } },
    },
    take: 10000,
  });
};
