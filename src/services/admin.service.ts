import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  Prisma,
  OrderStatus,
  UserStatus,
  ProductStatus,
  VerificationStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
  PlatformFeeType,
  FeeCalculationType,
  CATEGORY_TYPE,
  NotificationType,
  NotificationPriority,
  PayoutStatus,
} from '#prisma';

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
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
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
export const getUserDossier = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      wallet: true,
      payoutAccounts: { include: { bank: true } },
      verification: true,
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

  return {
    profile: user,
    stats: {
      totalBuyerOrders: user._count.ordersAsBuyer,
      totalSellerOrders: user._count.ordersAsSeller,
      totalProducts: user._count.products,
    },
    recentOrders,
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

  return {
    queue,
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
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Verify / Certify a product
 */
export const verifyProduct = async (productId: string, isCertified: boolean) => {
  return prisma.product.update({
    where: { id: productId },
    data: { isCertified },
  });
};

/**
 * Global Transaction Ledger Audit
 */
export const listTransactions = async (params: {
  page: number;
  limit: number;
  type?: TransactionType;
  status?: TransactionStatus;
}) => {
  const { page, limit, type, status } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (status) where.status = status;

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
export const listDisputes = async (params: { page: number; limit: number }) => {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const [disputes, total] = await Promise.all([
    prisma.order.findMany({
      where: { status: OrderStatus.DISPUTED },
      include: {
        buyer: { select: { fullName: true } },
        seller: { select: { fullName: true } },
        negotiation: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: { status: OrderStatus.DISPUTED } }),
  ]);

  return {
    disputes,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Resolve Order Dispute (Release or Refund)
 */
export const resolveDispute = async (
  orderId: string,
  resolution: 'RELEASE' | 'REFUND',
  note: string,
  adminId: string,
) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { transaction: true },
    });

    if (!order) throw new AppError('Order tidak ditemukan', 404);
    if (order.status !== OrderStatus.DISPUTED)
      throw new AppError('Order tidak dalam status sengketa', 400);

    const newOrderStatus = resolution === 'RELEASE' ? OrderStatus.COMPLETED : OrderStatus.CANCELLED;
    const newTrxStatus =
      resolution === 'RELEASE' ? TransactionStatus.RELEASED : TransactionStatus.REFUNDED;

    // 1. Update Order Status
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: newOrderStatus },
    });

    if (order.transaction) {
      await tx.transaction.update({
        where: { id: order.transaction.id },
        data: { status: newTrxStatus },
      });
    }

    // 3. Create Audit Log
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'RESOLVE_DISPUTE',
        entity: 'ORDER',
        entityId: orderId,
        newValue: { resolution, note, prevStatus: order.status },
      },
    });

    return updatedOrder;
  });
};

/**
 * Get detailed dispute evidence (photos, chat history context)
 */
export const getDisputeDetail = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: { select: { fullName: true, email: true, phone: true } },
      seller: { select: { fullName: true, email: true, phone: true } },
      items: { include: { product: true } },
      shipment: true,
      transaction: true,
      negotiation: true,
    },
  });

  if (!order) {
    throw new AppError('Sengketa order tidak ditemukan.', 404);
  }

  return order;
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

  // TODO:  Use fee from database or fallback to 3% if not configured
  if (!feeSetting) {
    throw new AppError(
      'Konfigurasi Biaya Transaksi (TRANSACTION_FEE) tidak ditemukan di database.',
      500,
    );
  }
  const feePercent = Number(feeSetting.amount) / 100;

  return {
    totalInEscrow: escrowHeld._sum.amount || 0,
    totalReleased: released._sum.amount || 0,
    totalRefunded: refunded._sum.amount || 0,
    platformRevenue: Number(released._sum.amount || 0) * feePercent,
  };
};

/**
 * Update product listing status (Unlist/Activate)
 */
export const updateProductStatus = async (productId: string, status: ProductStatus) => {
  return prisma.product.update({
    where: { id: productId },
    data: { status },
  });
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
  return prisma.category.create({
    data,
  });
};

export const updateCategory = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    categoryType?: CATEGORY_TYPE;
  },
) => {
  return prisma.category.update({
    where: { id },
    data,
  });
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
    newValue: { title, targetRole, userCount: users.length },
  });

  return { success: true, count: users.length };
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

  return {
    transactions,
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
