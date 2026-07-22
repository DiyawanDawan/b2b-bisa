import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import * as extended from '#services/admin-extended.service';
import {
  attachAdminChatThreadMedia,
  attachNegotiationMessageMedia,
} from '#utils/mediaResolver.util';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';
import { NegotiationStatus, OrderStatus, PostStatus } from '#prisma';

export const getOrderAnalytics = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminOrderAnalytics(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    extended.getOrderAnalytics(),
  );
  return successResponse(res, data, 'Statistik order berhasil diambil');
});

export const getIntegrationHealth = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminIntegrationHealth(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    extended.getIntegrationHealth(),
  );
  return successResponse(res, data, 'Ringkasan health integrasi berhasil diambil');
});

export const listOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search, status, courierCode, deliveryStatus } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
    status?: OrderStatus;
    courierCode?: string;
    deliveryStatus?: string;
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await extended.listOrders({
    page: pageNum,
    limit: limitNum,
    search,
    status,
    courierCode,
    deliveryStatus,
  });
  return paginatedResponse(res, result.orders, result.pagination.total, pageNum, limitNum);
});

export const getOrderDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const order = await extended.getOrderDetail(req.params.id);
  return successResponse(res, order, 'Detail order berhasil diambil');
});

export const listCartItems = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await extended.listCartItems({
    page: pageNum,
    limit: limitNum,
    search,
  });
  return res.status(200).json({
    meta: {
      success: true,
      status: 200,
      message: 'Data keranjang berhasil diambil',
    },
    data: { items: result.items, stats: result.stats },
    pagination: result.pagination,
  });
});

export const listWallets = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await extended.listWallets({
    page: pageNum,
    limit: limitNum,
    search,
  });
  return paginatedResponse(res, result.wallets, result.pagination.total, pageNum, limitNum);
});

export const listForumPosts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search, status } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
    status?: PostStatus;
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await extended.listForumPostsAdmin({
    page: pageNum,
    limit: limitNum,
    search,
    status,
  });
  return paginatedResponse(res, result.posts, result.pagination.total, pageNum, limitNum);
});

export const moderateForumPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    status?: PostStatus;
    title?: string;
    content?: string;
    categoryId?: string | null;
    tags?: string[];
  };

  const post =
    body.title !== undefined ||
    body.content !== undefined ||
    body.categoryId !== undefined ||
    body.tags !== undefined
      ? await extended.updateForumPostAdmin(req.params.id, req.user!.id, body)
      : await extended.moderateForumPost(req.params.id, body.status ?? PostStatus.PUBLISHED);

  return successResponse(res, post, 'Posting forum diperbarui');
});

export const listForumCategories = catchAsync(async (_req: AuthRequest, res: Response) => {
  const categories = await extended.listForumCategoriesAdmin();
  return successResponse(res, categories, 'Kategori forum berhasil diambil');
});

export const listForumGroups = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await extended.listForumGroupsAdmin({
    page: pageNum,
    limit: limitNum,
    search,
  });
  return paginatedResponse(res, result.groups, result.pagination.total, pageNum, limitNum);
});

export const getForumPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const post = await extended.getForumPostAdmin(req.params.id);
  return successResponse(res, post, 'Detail posting forum berhasil diambil');
});

export const createForumPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    title: string;
    content: string;
    status?: PostStatus;
    categoryId?: string;
    authorUserId?: string;
    tags?: string[];
  };
  const post = await extended.createForumPostAdmin(req.user!.id, body);
  return successResponse(res, post, 'Posting forum berhasil dibuat');
});

export const createForumComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const body = req.body as { content: string; parentId?: string };
  const comment = await extended.createForumCommentAdmin(req.user!.id, req.params.id, body);
  return successResponse(res, comment, 'Komentar admin berhasil ditambahkan', 201);
});

export const listPolicies = catchAsync(async (_req: AuthRequest, res: Response) => {
  const policies = await extended.listPoliciesAdmin();
  return successResponse(res, policies, 'Daftar kebijakan berhasil diambil');
});

export const updatePolicy = catchAsync(async (req: AuthRequest, res: Response) => {
  const policy = await extended.updatePolicyAdmin(req.params.id, req.body);
  return successResponse(res, policy, 'Kebijakan berhasil diperbarui');
});

export const getMarketTrends = catchAsync(async (req: AuthRequest, res: Response) => {
  const { category } = req.query as { category?: string };
  const trends = await extended.getMarketTrendsAdmin(category);
  return successResponse(res, trends, 'Tren pasar berhasil diambil');
});

export const listRegions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { level, parentId, search } = req.query as {
    level: 'country' | 'province' | 'regency' | 'district' | 'village';
    parentId?: string;
    search?: string;
  };
  const result = await extended.listRegionsAdmin({ level, parentId, search });
  return successResponse(res, result, `Daftar ${level} berhasil diambil`);
});

export const createRegion = catchAsync(async (req: AuthRequest, res: Response) => {
  const region = await extended.createRegion(req.body);
  return successResponse(res, region, 'Wilayah berhasil ditambahkan');
});

export const updateRegion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { level, ...data } = req.body as {
    level: 'country' | 'province' | 'regency' | 'district' | 'village';
    name?: string;
    code?: string;
    shortCode?: string;
    continent?: string;
    villageType?: 'KELURAHAN' | 'DESA';
  };
  const region = await extended.updateRegion(level, req.params.id, data);
  return successResponse(res, region, 'Wilayah berhasil diperbarui');
});

export const deleteRegion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { level } = req.query as {
    level: 'country' | 'province' | 'regency' | 'district' | 'village';
  };
  const result = await extended.deleteRegion(level, req.params.id);
  return successResponse(res, result, 'Wilayah berhasil dihapus');
});

export const getChatStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await extended.getChatStats(req.user!.id, req.user!.role);
  return successResponse(res, data, 'Statistik chat berhasil diambil');
});

export const listChatInbox = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, search, status, scope } = req.query as {
    page?: string;
    limit?: string;
    search?: string;
    status?: NegotiationStatus;
    scope?: 'negotiation' | 'dispute';
  };
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const result = await extended.listChatInbox({
    userId: req.user!.id,
    userRole: req.user!.role,
    page: pageNum,
    limit: limitNum,
    search,
    status,
    scope,
  });
  return paginatedResponse(res, result.items, result.pagination.total, pageNum, limitNum);
});

export const getChatThread = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit } = req.query as { page: number; limit: number };
  const data = await extended.getChatThread(
    req.params.negotiationId,
    req.user!.id,
    req.user!.role,
    {
      page,
      limit,
    },
  );
  return successResponse(res, attachAdminChatThreadMedia(data), 'Riwayat chat berhasil diambil');
});

export const sendAdminChatMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { content } = req.body as { content: string };
  const message = await extended.sendAdminChatMessage(
    req.params.negotiationId,
    req.user!.id,
    req.user!.role,
    content,
  );
  return successResponse(res, attachNegotiationMessageMedia(message), 'Pesan moderasi terkirim');
});
