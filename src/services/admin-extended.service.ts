import prisma from '#config/prisma';
import AppError from '#utils/appError';
import {
  NegotiationStatus,
  OrderStatus,
  PaymentStatus,
  PostStatus,
  Prisma,
  TransactionStatus,
  UserRole,
  VillageType,
  TrendCategory,
} from '#prisma';
import * as marketService from '#services/market.service';
import * as forumService from '#services/forum.service';
import * as negotiationService from '#services/negotiation.service';
import { sendDisputeMediationMessage } from '#services/dispute-mediation.service';
import { invalidatePolicies } from '#utils/cache.util';
import { POLICY_KEYS } from '#services/policy.service';
import { CATEGORY_TYPE } from '#prisma';
import { attachOrderMediaUrls } from '#utils/orderMedia.util';
import { attachUserMediaUrls } from '#utils/userMedia.util';
import { attachForumMediaUrls, resolveMediaField } from '#utils/mediaResolver.util';

export const listOrders = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: OrderStatus;
  courierCode?: string;
  deliveryStatus?: string;
}) => {
  const { page, limit, search, status, courierCode, deliveryStatus } = params;
  const skip = (page - 1) * limit;
  const courierFilter = courierCode?.trim().toLowerCase();

  const and: Prisma.OrderWhereInput[] = [];
  if (status) and.push({ status });
  if (search) {
    and.push({
      OR: [
        { orderNumber: { contains: search } },
        { buyer: { fullName: { contains: search } } },
        { seller: { fullName: { contains: search } } },
      ],
    });
  }
  if (courierFilter) {
    and.push({
      OR: [
        { orderShipping: { courierCode: courierFilter } },
        { shipment: { courierCode: courierFilter } },
      ],
    });
  }
  if (deliveryStatus?.trim()) {
    and.push({ shipment: { deliveryStatus: deliveryStatus.trim() } });
  }
  const where: Prisma.OrderWhereInput = and.length > 0 ? { AND: and } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        totalQuantity: true,
        createdAt: true,
        updatedAt: true,
        buyer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        seller: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        dispute: { select: { id: true, status: true } },
        orderShipping: { select: { courierCode: true } },
        shipment: { select: { courierCode: true, deliveryStatus: true } },
        transaction: {
          select: {
            id: true,
            paymentMethod: true,
            paymentStatus: true,
            status: true,
            paidAt: true,
            paymentChannel: {
              select: { id: true, code: true, name: true, group: true, logoUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  const mapped = orders.map((o) => ({
    ...o,
    buyer: attachUserMediaUrls({ ...o.buyer }),
    seller: attachUserMediaUrls({ ...o.seller }),
    courierCode: o.orderShipping?.courierCode ?? o.shipment?.courierCode ?? null,
    deliveryStatus: o.shipment?.deliveryStatus ?? null,
    orderShipping: undefined,
    shipment: undefined,
  }));

  return {
    orders: mapped,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getIntegrationHealth = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const pendingCutoff = new Date();
  pendingCutoff.setHours(pendingCutoff.getHours() - 24);

  const [pendingOver24h, missingShippingMeta, failedPayments7d, unreadNotifications] =
    await Promise.all([
      prisma.order.count({
        where: {
          status: OrderStatus.PENDING,
          createdAt: { lt: pendingCutoff },
        },
      }),
      prisma.order.count({
        where: {
          status: { in: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.COMPLETED] },
          orderShipping: null,
        },
      }),
      prisma.transaction.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          OR: [
            { status: TransactionStatus.FAILED },
            { paymentStatus: PaymentStatus.FAILED },
            { paymentStatus: PaymentStatus.EXPIRED },
          ],
        },
      }),
      prisma.notification.count({
        where: { isRead: false },
      }),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      pendingOver24h,
      missingShippingMeta,
      failedPayments7d,
      unreadNotifications,
    },
    status:
      pendingOver24h > 0 || missingShippingMeta > 0 || failedPayments7d > 0
        ? 'NEEDS_ATTENTION'
        : 'HEALTHY',
  };
};

type DailyRow = { x: Date | string; y: number | string | null };

function fillDailySeries(raw: DailyRow[], days = 30): { x: string; y: number }[] {
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
 * Ringkasan & data chart untuk halaman admin order.
 */
export const getOrderAnalytics = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAgo = new Date();
  oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const inProgressStatuses: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
  ];

  const [
    byStatus,
    dailyOrderRaw,
    dailyRevenueRaw,
    monthlyOrderRaw,
    monthlyRevenueRaw,
    totalOrders,
    completedOrders,
    activeDisputes,
    inProgress,
    thisMonthOrders,
    completedGmv,
    thisMonthGmv,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE(created_at) as x, COUNT(*) as y
      FROM orders
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY x ASC
    `,
    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE(created_at) as x, SUM(total_amount) as y
      FROM orders
      WHERE status = ${OrderStatus.COMPLETED}
        AND created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY x ASC
    `,
    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as x, COUNT(*) as y
      FROM orders
      WHERE created_at >= ${oneYearAgo}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY x ASC
    `,
    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_FORMAT(created_at, '%Y-%m') as x, SUM(total_amount) as y
      FROM orders
      WHERE status = ${OrderStatus.COMPLETED}
        AND created_at >= ${oneYearAgo}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY x ASC
    `,
    prisma.order.count(),
    prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
    prisma.order.count({ where: { status: OrderStatus.DISPUTED } }),
    prisma.order.count({ where: { status: { in: inProgressStatuses } } }),
    prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED, createdAt: { gte: monthStart } },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    summary: {
      totalOrders,
      completedOrders,
      activeDisputes,
      inProgress,
      thisMonthOrders,
      completedGmv: Number(completedGmv._sum.totalAmount ?? 0),
      thisMonthGmv: Number(thisMonthGmv._sum.totalAmount ?? 0),
    },
    byStatus: byStatus.map((row) => ({
      status: row.status,
      count: row._count.id,
    })),
    dailyOrders: fillDailySeries(dailyOrderRaw),
    dailyRevenue: fillDailySeries(dailyRevenueRaw),
    monthlyOrders: monthlyOrderRaw.map((row) => ({
      x: String(row.x),
      y: Number(row.y ?? 0),
    })),
    monthlyRevenue: monthlyRevenueRaw.map((row) => ({
      x: String(row.x),
      y: Number(row.y ?? 0),
    })),
  };
};

export const getOrderDetail = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
      seller: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
      dispute: true,
      transaction: {
        select: {
          id: true,
          status: true,
          amount: true,
          paymentMethod: true,
          paymentStatus: true,
          paidAt: true,
          externalId: true,
          paymentChannel: {
            select: { id: true, code: true, name: true, group: true, logoUrl: true },
          },
        },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          pricePerUnit: true,
          product: {
            select: {
              id: true,
              name: true,
              thumbnailUrl: true,
              images: { select: { url: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!order) throw new AppError('Order tidak ditemukan', 404);
  return attachOrderMediaUrls(order);
};

export const listCartItems = async (params: { page: number; limit: number; search?: string }) => {
  const { page, limit, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.CartItemWhereInput = search
    ? {
        OR: [
          { user: { fullName: { contains: search } } },
          { user: { email: { contains: search } } },
          { product: { name: { contains: search } } },
        ],
      }
    : {};

  const [items, total, stats] = await Promise.all([
    prisma.cartItem.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
        product: {
          select: {
            id: true,
            name: true,
            pricePerUnit: true,
            stock: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.cartItem.count({ where }),
    prisma.cartItem.aggregate({
      _count: { id: true },
    }),
  ]);

  const uniqueBuyers = await prisma.cartItem.groupBy({
    by: ['userId'],
    _count: { userId: true },
  });

  return {
    items,
    stats: {
      totalLineItems: stats._count.id,
      uniqueBuyers: uniqueBuyers.length,
    },
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const listWallets = async (params: { page: number; limit: number; search?: string }) => {
  const { page, limit, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.WalletWhereInput = search
    ? {
        user: {
          OR: [{ fullName: { contains: search } }, { email: { contains: search } }],
        },
      }
    : {};

  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true, status: true } },
      },
      orderBy: { balance: 'desc' },
      skip,
      take: limit,
    }),
    prisma.wallet.count({ where }),
  ]);

  return {
    wallets,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const listForumPostsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: PostStatus;
}) => {
  const { page, limit, search, status } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.ForumPostWhereInput = {
    ...(status && { status }),
    ...(search && {
      OR: [{ title: { contains: search } }, { content: { contains: search } }],
    }),
  };

  const [posts, total] = await Promise.all([
    prisma.forumPost.findMany({
      where,
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        mediaUrls: true,
        tags: true,
        productMentions: true,
        categoryId: true,
        groupId: true,
        upvotes: true,
        downvotes: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
        },
        category: { select: { id: true, name: true } },
        group: {
          select: {
            id: true,
            name: true,
            slug: true,
            avatarUrl: true,
            bannerUrl: true,
            memberCount: true,
          },
        },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.forumPost.count({ where }),
  ]);

  return {
    posts: posts.map(mapAdminForumPost),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

const mapAdminForumPost = <
  T extends {
    user?: { avatarUrl?: string | null; [key: string]: unknown } | null;
    group?: {
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      [key: string]: unknown;
    } | null;
    mediaUrls?: unknown;
    [key: string]: unknown;
  },
>(
  post: T,
) => {
  const withMedia = attachForumMediaUrls({
    ...post,
    mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls : post.mediaUrls ?? null,
  } as T & { mediaUrls?: unknown[] | null });

  const user = withMedia.user
    ? attachUserMediaUrls({ ...withMedia.user })
    : withMedia.user;

  const group = withMedia.group
    ? {
        ...withMedia.group,
        avatarUrl: resolveMediaField(
          (withMedia.group as { avatarUrl?: string | null }).avatarUrl ?? null,
        ),
        bannerUrl: resolveMediaField(
          (withMedia.group as { bannerUrl?: string | null }).bannerUrl ?? null,
        ),
      }
    : withMedia.group;

  return { ...withMedia, user, group };
};

export const moderateForumPost = async (postId: string, status: PostStatus) => {
  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post) throw new AppError('Posting forum tidak ditemukan', 404);
  return prisma.forumPost.update({
    where: { id: postId },
    data: { status },
  });
};

export const listForumCategoriesAdmin = async () => {
  return prisma.category.findMany({
    where: { categoryType: CATEGORY_TYPE.FORUM },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
};

export const listForumGroupsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
}) => {
  const { page, limit, search } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.ForumGroupWhereInput = search
    ? {
        OR: [
          { name: { contains: search } },
          { slug: { contains: search } },
          { description: { contains: search } },
        ],
      }
    : {};

  const [groups, total] = await Promise.all([
    prisma.forumGroup.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatarUrl: true,
        bannerUrl: true,
        isPublic: true,
        memberCount: true,
        createdAt: true,
        owner: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.forumGroup.count({ where }),
  ]);

  return {
    groups: groups.map((g) => ({
      ...g,
      avatarUrl: resolveMediaField(g.avatarUrl),
      bannerUrl: resolveMediaField(g.bannerUrl),
      owner: attachUserMediaUrls({ ...g.owner }),
      postCount: g._count.posts,
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getForumPostAdmin = async (postId: string) => {
  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      mediaUrls: true,
      tags: true,
      productMentions: true,
      categoryId: true,
      groupId: true,
      upvotes: true,
      downvotes: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          avatarUrl: true,
        },
      },
      category: { select: { id: true, name: true } },
      group: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarUrl: true,
          bannerUrl: true,
          memberCount: true,
        },
      },
      _count: { select: { comments: true } },
    },
  });
  if (!post) throw new AppError('Posting forum tidak ditemukan', 404);
  return mapAdminForumPost(post);
};

export const createForumPostAdmin = async (
  adminId: string,
  data: {
    title: string;
    content: string;
    status?: PostStatus;
    categoryId?: string;
    authorUserId?: string;
    tags?: string[];
  },
) => {
  const authorId = data.authorUserId ?? adminId;
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, role: true },
  });
  if (!author) throw new AppError('Penulis tidak ditemukan', 404);

  if (data.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: data.categoryId, categoryType: CATEGORY_TYPE.FORUM },
    });
    if (!cat) throw new AppError('Kategori forum tidak valid', 400);
  }

  return forumService.createPost(authorId, {
    title: data.title,
    content: data.content,
    categoryId: data.categoryId,
    status: data.status ?? PostStatus.PUBLISHED,
    tags: data.tags,
  });
};

export const updateForumPostAdmin = async (
  postId: string,
  adminId: string,
  data: {
    title?: string;
    content?: string;
    status?: PostStatus;
    categoryId?: string | null;
    tags?: string[];
  },
) => {
  if (data.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: data.categoryId, categoryType: CATEGORY_TYPE.FORUM },
    });
    if (!cat) throw new AppError('Kategori forum tidak valid', 400);
  }

  return forumService.updatePost(postId, adminId, data, 'ADMIN');
};

export const listPoliciesAdmin = async () => {
  const policies = await prisma.policy.findMany({
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      content: true,
      version: true,
      isActive: true,
      updatedAt: true,
    },
  });
  return policies.map((p) => ({
    ...p,
    key: Object.entries(POLICY_KEYS).find(([, title]) => title === p.title)?.[0] ?? null,
  }));
};

export const updatePolicyAdmin = async (
  id: string,
  data: { content?: string; version?: string; isActive?: boolean },
) => {
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) throw new AppError('Kebijakan tidak ditemukan', 404);
  const updated = await prisma.policy.update({
    where: { id },
    data: {
      ...(data.content !== undefined && { content: data.content }),
      ...(data.version !== undefined && { version: data.version }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: {
      id: true,
      title: true,
      content: true,
      version: true,
      isActive: true,
      updatedAt: true,
    },
  });
  void invalidatePolicies();
  return updated;
};

export const getMarketTrendsAdmin = async (category?: string) =>
  marketService.getMarketTrends(category as TrendCategory | undefined);

type RegionLevel = 'country' | 'province' | 'regency' | 'district' | 'village';

const CHILD_LABEL: Record<RegionLevel, string> = {
  country: 'provinsi',
  province: 'kab/kota',
  regency: 'kecamatan',
  district: 'desa/kel',
  village: '',
};

export const listRegionsAdmin = async (params: {
  level: RegionLevel;
  parentId?: string;
  search?: string;
}) => {
  const { level, parentId, search } = params;
  const nameFilter = search?.trim() ? { contains: search.trim() } : undefined;

  switch (level) {
    case 'country': {
      const rows = await prisma.country.findMany({
        where: nameFilter ? { name: nameFilter } : undefined,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          continent: true,
          _count: { select: { provinces: true } },
        },
      });
      return {
        level,
        parentId: null,
        childLabel: CHILD_LABEL.country,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          continent: r.continent,
          childCount: r._count.provinces,
        })),
      };
    }
    case 'province': {
      if (!parentId) throw new AppError('parentId (negara) wajib untuk level provinsi', 400);
      const rows = await prisma.province.findMany({
        where: {
          countryId: parentId,
          ...(nameFilter && { name: nameFilter }),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          shortCode: true,
          _count: { select: { regencies: true } },
        },
      });
      return {
        level,
        parentId,
        childLabel: CHILD_LABEL.province,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          shortCode: r.shortCode,
          childCount: r._count.regencies,
        })),
      };
    }
    case 'regency': {
      if (!parentId) throw new AppError('parentId (provinsi) wajib untuk level kabupaten', 400);
      const rows = await prisma.regency.findMany({
        where: {
          provinceId: parentId,
          ...(nameFilter && { name: nameFilter }),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          shortCode: true,
          _count: { select: { districts: true } },
        },
      });
      return {
        level,
        parentId,
        childLabel: CHILD_LABEL.regency,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          shortCode: r.shortCode,
          childCount: r._count.districts,
        })),
      };
    }
    case 'district': {
      if (!parentId) throw new AppError('parentId (kabupaten) wajib untuk level kecamatan', 400);
      const rows = await prisma.district.findMany({
        where: {
          regencyId: parentId,
          ...(nameFilter && { name: nameFilter }),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          _count: { select: { villages: true } },
        },
      });
      return {
        level,
        parentId,
        childLabel: CHILD_LABEL.district,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          childCount: r._count.villages,
        })),
      };
    }
    case 'village': {
      if (!parentId) throw new AppError('parentId (kecamatan) wajib untuk level desa', 400);
      const rows = await prisma.village.findMany({
        where: {
          districtId: parentId,
          ...(nameFilter && { name: nameFilter }),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
        },
      });
      return {
        level,
        parentId,
        childLabel: CHILD_LABEL.village,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          villageType: r.type,
          childCount: 0,
        })),
      };
    }
    default:
      throw new AppError('Level wilayah tidak valid', 400);
  }
};

export const createRegion = async (input: {
  level: RegionLevel;
  parentId?: string;
  name: string;
  code: string;
  shortCode?: string;
  continent?: string;
  villageType?: VillageType;
}) => {
  const { level, parentId, name, code, shortCode, continent, villageType } = input;

  switch (level) {
    case 'country':
      return prisma.country.create({
        data: { name, code, continent: continent || 'Asia' },
        select: { id: true, name: true, code: true },
      });
    case 'province': {
      if (!parentId) throw new AppError('parentId (country) wajib untuk provinsi', 400);
      return prisma.province.create({
        data: { countryId: parentId, name, code, shortCode },
        select: { id: true, name: true, code: true },
      });
    }
    case 'regency': {
      if (!parentId) throw new AppError('parentId (province) wajib untuk kabupaten', 400);
      return prisma.regency.create({
        data: { provinceId: parentId, name, code, shortCode },
        select: { id: true, name: true, code: true },
      });
    }
    case 'district': {
      if (!parentId) throw new AppError('parentId (regency) wajib untuk kecamatan', 400);
      return prisma.district.create({
        data: { regencyId: parentId, name, code },
        select: { id: true, name: true, code: true },
      });
    }
    case 'village': {
      if (!parentId) throw new AppError('parentId (district) wajib untuk desa/kelurahan', 400);
      return prisma.village.create({
        data: {
          districtId: parentId,
          name,
          code,
          type: villageType || VillageType.DESA,
        },
        select: { id: true, name: true, code: true },
      });
    }
    default:
      throw new AppError('Level wilayah tidak valid', 400);
  }
};

export const updateRegion = async (
  level: RegionLevel,
  id: string,
  data: {
    name?: string;
    code?: string;
    shortCode?: string;
    continent?: string;
    villageType?: VillageType;
  },
) => {
  switch (level) {
    case 'country':
      return prisma.country.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.code && { code: data.code }),
          ...(data.continent && { continent: data.continent }),
        },
        select: { id: true, name: true, code: true },
      });
    case 'province':
      return prisma.province.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.code && { code: data.code }),
          ...(data.shortCode !== undefined && { shortCode: data.shortCode }),
        },
        select: { id: true, name: true, code: true },
      });
    case 'regency':
      return prisma.regency.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.code && { code: data.code }),
          ...(data.shortCode !== undefined && { shortCode: data.shortCode }),
        },
        select: { id: true, name: true, code: true },
      });
    case 'district':
      return prisma.district.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.code && { code: data.code }),
        },
        select: { id: true, name: true, code: true },
      });
    case 'village':
      return prisma.village.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.code && { code: data.code }),
          ...(data.villageType && { type: data.villageType }),
        },
        select: { id: true, name: true, code: true, type: true },
      });
    default:
      throw new AppError('Level wilayah tidak valid', 400);
  }
};

const childCount = async (level: RegionLevel, id: string): Promise<number> => {
  switch (level) {
    case 'country':
      return prisma.province.count({ where: { countryId: id } });
    case 'province':
      return prisma.regency.count({ where: { provinceId: id } });
    case 'regency':
      return prisma.district.count({ where: { regencyId: id } });
    case 'district':
      return prisma.village.count({ where: { districtId: id } });
    default:
      return 0;
  }
};

export const deleteRegion = async (level: RegionLevel, id: string) => {
  const children = await childCount(level, id);
  if (children > 0) {
    throw new AppError('Wilayah masih memiliki sub-wilayah. Hapus anak terlebih dahulu.', 400);
  }

  switch (level) {
    case 'country':
      await prisma.country.delete({ where: { id } });
      break;
    case 'province':
      await prisma.province.delete({ where: { id } });
      break;
    case 'regency':
      await prisma.regency.delete({ where: { id } });
      break;
    case 'district':
      await prisma.district.delete({ where: { id } });
      break;
    case 'village':
      await prisma.village.delete({ where: { id } });
      break;
    default:
      throw new AppError('Level wilayah tidak valid', 400);
  }
  return { deleted: true };
};

const ADMIN_CHAT_MESSAGE_SELECT = {
  id: true,
  negotiationId: true,
  senderId: true,
  content: true,
  attachmentUrl: true,
  isSystemMessage: true,
  isRead: true,
  isDeleted: true,
  editedAt: true,
  createdAt: true,
  sender: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
} as const;

const negotiationParticipantWhere = (userId: string): Prisma.NegotiationWhereInput => ({
  OR: [{ buyerId: userId }, { sellerId: userId }],
});

const assertNegotiationParticipant = (
  negotiation: { buyerId: string; sellerId: string },
  userId: string,
) => {
  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    throw new AppError(
      'Akses ditolak. Anda hanya dapat membuka chat negosiasi yang melibatkan akun Anda.',
      403,
    );
  }
};

const disputeMediationNegotiationWhere = (): Prisma.NegotiationWhereInput => ({
  orderId: { not: null },
  order: { status: OrderStatus.DISPUTED },
});

const resolveDisputeOrderId = (negotiation: {
  order: { id: string; status: OrderStatus } | null;
}) => (negotiation.order?.status === OrderStatus.DISPUTED ? negotiation.order.id : null);

const CHAT_INBOX_SELECT = {
  id: true,
  status: true,
  updatedAt: true,
  createdAt: true,
  totalEstimate: true,
  buyer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  seller: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  product: { select: { id: true, name: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      dispute: {
        select: {
          mediationStartedAt: true,
          readyToResolveAt: true,
          status: true,
        },
      },
    },
  },
  _count: { select: { messages: true } },
  messages: {
    where: { isDeleted: false },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      content: true,
      createdAt: true,
      isSystemMessage: true,
      sender: { select: { id: true, fullName: true, role: true } },
    },
  },
} as const;

const mapChatInboxItems = (
  items: Array<{
    messages: Array<{
      id: string;
      content: string;
      createdAt: Date;
      isSystemMessage: boolean;
      sender: { id: string; fullName: string; role: UserRole };
    }>;
    buyer: { id: string; fullName: string; email: string; avatarUrl: string | null };
    seller: { id: string; fullName: string; email: string; avatarUrl: string | null };
    order: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
      dispute: {
        mediationStartedAt: Date | null;
        readyToResolveAt: Date | null;
        status: string;
      } | null;
    } | null;
    [key: string]: unknown;
  }>,
  scope: 'negotiation' | 'dispute',
) =>
  items.map(({ messages, ...rest }) => ({
    ...rest,
    buyer: attachUserMediaUrls({ ...rest.buyer }),
    seller: attachUserMediaUrls({ ...rest.seller }),
    lastMessage: messages[0] ?? null,
    isDisputeMediation: scope === 'dispute',
    mediationStartedAt: rest.order?.dispute?.mediationStartedAt ?? null,
    readyToResolveAt: rest.order?.dispute?.readyToResolveAt ?? null,
  }));

/**
 * Inbox chat — negosiasi akun sendiri, atau grup mediasi sengketa (scope=dispute, admin).
 */
export const listChatInbox = async (params: {
  userId: string;
  userRole: UserRole;
  page: number;
  limit: number;
  search?: string;
  status?: NegotiationStatus;
  scope?: 'negotiation' | 'dispute';
}) => {
  const { userId, userRole, page, limit, search, status, scope = 'negotiation' } = params;
  const skip = (page - 1) * limit;

  if (scope === 'dispute' && userRole !== UserRole.ADMIN) {
    throw new AppError('Grup mediasi sengketa hanya untuk admin.', 403);
  }

  const searchFilter: Prisma.NegotiationWhereInput | undefined = search
    ? {
        OR: [
          { product: { name: { contains: search } } },
          { buyer: { fullName: { contains: search } } },
          { buyer: { email: { contains: search } } },
          { seller: { fullName: { contains: search } } },
          { seller: { email: { contains: search } } },
          { order: { orderNumber: { contains: search } } },
        ],
      }
    : undefined;

  const where: Prisma.NegotiationWhereInput = {
    ...(scope === 'dispute'
      ? disputeMediationNegotiationWhere()
      : negotiationParticipantWhere(userId)),
    ...(status && scope === 'negotiation' ? { status } : {}),
    ...(searchFilter ?? {}),
  };

  const [items, total] = await Promise.all([
    prisma.negotiation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      select: CHAT_INBOX_SELECT,
    }),
    prisma.negotiation.count({ where }),
  ]);

  return {
    items: mapChatInboxItems(items, scope),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getChatStats = async (userId: string, userRole: UserRole) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const participantWhere = negotiationParticipantWhere(userId);

  const [totalRooms, totalMessages, activeRooms, openNegotiations, disputeGroups] =
    await Promise.all([
      prisma.negotiation.count({ where: participantWhere }),
      prisma.chatMessage.count({
        where: { isDeleted: false, negotiation: participantWhere },
      }),
      prisma.negotiation.count({
        where: { ...participantWhere, updatedAt: { gte: sevenDaysAgo } },
      }),
      prisma.negotiation.count({
        where: {
          ...participantWhere,
          status: NegotiationStatus.OPEN_NEGOTIATION,
        },
      }),
      userRole === UserRole.ADMIN
        ? prisma.negotiation.count({ where: disputeMediationNegotiationWhere() })
        : Promise.resolve(0),
    ]);

  return { totalRooms, totalMessages, activeRooms, openNegotiations, disputeGroups };
};

export const getChatThread = async (
  negotiationId: string,
  userId: string,
  userRole: UserRole,
  params: { page: number; limit: number },
) => {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      status: true,
      quantity: true,
      pricePerUnit: true,
      totalEstimate: true,
      createdAt: true,
      updatedAt: true,
      buyer: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
      seller: { select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true } },
      product: { select: { id: true, name: true, unit: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          dispute: {
            select: {
              mediationStartedAt: true,
              readyToResolveAt: true,
              status: true,
            },
          },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  if (!negotiation) throw new AppError('Ruang chat tidak ditemukan', 404);

  const disputeOrderId = resolveDisputeOrderId(negotiation);
  const isDisputeMediation = Boolean(disputeOrderId);
  if (isDisputeMediation) {
    if (userRole !== UserRole.ADMIN) {
      throw new AppError('Grup mediasi sengketa hanya dapat dibuka oleh admin.', 403);
    }
  } else if (userRole !== UserRole.ADMIN) {
    assertNegotiationParticipant(negotiation, userId);
  }

  const [messages, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { negotiationId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
      select: ADMIN_CHAT_MESSAGE_SELECT,
    }),
    prisma.chatMessage.count({ where: { negotiationId, isDeleted: false } }),
  ]);

  return {
    negotiation: {
      ...negotiation,
      buyer: attachUserMediaUrls({ ...negotiation.buyer }),
      seller: attachUserMediaUrls({ ...negotiation.seller }),
    },
    messages,
    isDisputeMediation,
    mediationStartedAt: negotiation.order?.dispute?.mediationStartedAt ?? null,
    readyToResolveAt: negotiation.order?.dispute?.readyToResolveAt ?? null,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const sendAdminChatMessage = async (
  negotiationId: string,
  userId: string,
  userRole: UserRole,
  content: string,
) => {
  const trimmed = content.trim();
  if (!trimmed) throw new AppError('Pesan tidak boleh kosong.', 400);

  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    select: {
      buyerId: true,
      sellerId: true,
      order: { select: { id: true, status: true } },
    },
  });
  if (!negotiation) throw new AppError('Ruang chat tidak ditemukan', 404);

  const disputeOrderId = resolveDisputeOrderId(negotiation);
  if (disputeOrderId) {
    if (userRole !== UserRole.ADMIN) {
      throw new AppError('Hanya admin yang dapat mengirim pesan di grup mediasi sengketa.', 403);
    }
    const message = await sendDisputeMediationMessage(disputeOrderId, userId, trimmed);
    return {
      id: message.id,
      negotiationId: message.negotiationId,
      senderId: message.senderId,
      content: message.content,
      attachmentUrl: message.attachmentUrl,
      isSystemMessage: message.isSystemMessage,
      isRead: message.isRead,
      isDeleted: message.isDeleted,
      editedAt: message.editedAt,
      createdAt: message.createdAt,
      sender: message.sender,
    };
  }

  const message = await negotiationService.sendChatMessage(negotiationId, userId, trimmed);

  return {
    id: message.id,
    negotiationId: message.negotiationId,
    senderId: message.senderId,
    content: message.content,
    attachmentUrl: message.attachmentUrl,
    isSystemMessage: message.isSystemMessage,
    isRead: message.isRead,
    isDeleted: message.isDeleted,
    editedAt: message.editedAt,
    createdAt: message.createdAt,
    sender: message.sender,
  };
};
