import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import { toCsv } from '#utils/csv.util';
import AppError from '#utils/appError';
import * as adminService from '#services/admin.service';
import * as disputeMediationService from '#services/dispute-mediation.service';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys, invalidateAdminAnalytics } from '#utils/cache.util';
import {
  UserRole,
  UserStatus,
  ProductStatus,
  VerificationStatus,
  TransactionType,
  TransactionStatus,
  PlatformFeeType,
  FeeCalculationType,
  CATEGORY_TYPE,
  NotificationPriority,
  PayoutStatus,
} from '#prisma';

/**
 * GET /api/v1/admin/dashboard/stats
 * Ambil statistik ringkasan platform (GMV, Akun, Sengketa, dll.)
 */
export const getDashboardStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await cacheAside(cacheKeys.adminDashStats(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getDashboardStats(),
  );
  successResponse(res, stats, 'Statistik dashboard berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/biomass-trend
 */
export const getBiomassTrend = catchAsync(async (req: AuthRequest, res: Response) => {
  const trend = await cacheAside(cacheKeys.adminBiomassTrend(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getBiomassTrend(),
  );
  successResponse(res, trend, 'Data tren biomassa berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/revenue
 */
export const getRevenueAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminRevenue(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getRevenueAnalytics(),
  );
  successResponse(res, data, 'Data revenue analytics berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/users
 */
export const getUserAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminUsersChart(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getUserAnalytics(),
  );
  successResponse(res, data, 'Data user analytics berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/categories
 */
export const getCategoryAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminCategoriesChart(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getCategoryAnalytics(),
  );
  successResponse(res, data, 'Data category analytics berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/performance
 */
export const getTopSuppliers = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminTopSuppliers(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getTopSuppliers(),
  );
  successResponse(res, data, 'Data top suppliers berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/analytics/platform
 */
export const getDashboardPlatformAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminPlatformAnalytics(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getDashboardPlatformAnalytics(),
  );
  successResponse(res, data, 'Analitik platform berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/visual-gallery
 */
export const getDashboardVisualGallery = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await cacheAside(cacheKeys.adminVisualGallery(), CACHE_TTL.ADMIN_GALLERY, () =>
    adminService.getDashboardVisualGallery(),
  );
  successResponse(res, data, 'Galeri visual dashboard berhasil diambil');
});

/**
 * GET /api/v1/admin/users/stats
 */
export const getUserAnalyticsStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await adminService.getUserAnalyticsStats();
  successResponse(res, data, 'Statistik pengguna berhasil diambil');
});

/**
 * GET /api/v1/admin/users
 */
export const listUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10, role, status, search } = req.query;
  const result = await adminService.listUsers({
    page: Number(page),
    limit: Number(limit),
    role: role as UserRole,
    status: status as UserStatus,
    search: search as string,
  });
  return paginatedResponse(
    res,
    result.users,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar user berhasil diambil',
  );
});

/**
 * GET /api/v1/admin/users/:id/dossier
 * Dossier 360 derajat user untuk audit
 */
export const getUserDossier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const unmask = req.query.unmask === 'true';
  const dossier = await adminService.getUserDossier(id, { unmaskPayoutAccounts: unmask });

  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'VIEW_USER_DOSSIER',
    entity: 'USER',
    entityId: id,
    newValue: { targetUserId: id, adminId: req.user!.id, unmask },
  });

  successResponse(res, dossier, 'Dossier user berhasil diambil');
});

/**
 * PATCH /api/v1/admin/users/:id/status
 */
export const updateUserStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await adminService.updateUserStatus(id, status as UserStatus);

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'UPDATE_USER_STATUS',
    entity: 'USER',
    entityId: id,
    newValue: { status },
  });

  successResponse(res, result, `Status user berhasil diperbarui menjadi ${status}`);
});

/**
 * GET /api/v1/admin/users/kyc-queue
 */
export const getKYCQueue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10, status } = req.query;
  const queue = await adminService.listKYCQueue({
    page: Number(page),
    limit: Number(limit),
    status: status as VerificationStatus,
  });
  return paginatedResponse(
    res,
    queue.queue,
    queue.pagination.total,
    queue.pagination.page,
    queue.pagination.limit,
    'Antrean KYC berhasil diambil',
  );
});

/**
 * GET /api/v1/admin/products
 */
export const listAllProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10, status, search } = req.query;
  const result = await adminService.listAllProducts({
    page: Number(page),
    limit: Number(limit),
    status: status as ProductStatus,
    search: search as string,
  });
  return paginatedResponse(
    res,
    result.products,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar produk berhasil diambil',
  );
});

/**
 * PATCH /api/v1/admin/products/:id/certify
 */
export const certifyProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isCertified } = req.body as { isCertified: boolean };
  const result = await adminService.verifyProduct(id, isCertified);

  if (result.changed) {
    try {
      await adminService.createAuditLog({
        userId: req.user!.id,
        action: 'CERTIFY_PRODUCT',
        entity: 'PRODUCT',
        entityId: id,
        oldValue: { isCertified: result.previousIsCertified },
        newValue: { isCertified },
      });
    } catch {
      /* audit gagal tidak memblokir sertifikasi */
    }
  }

  successResponse(res, result.product, 'Status sertifikasi produk berhasil diperbarui');
});

/**
 * GET /api/v1/admin/finance/transactions
 */
export const listTransactions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10, type, status, search } = req.query;
  const result = await adminService.listTransactions({
    page: Number(page),
    limit: Number(limit),
    type: type as TransactionType,
    status: status as TransactionStatus,
    search: search as string,
  });
  return paginatedResponse(
    res,
    result.transactions,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar transaksi berhasil diambil',
  );
});

/**
 * GET /api/v1/admin/orders/disputes
 */
export const listDisputes = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10, search, statusFilter } = req.query;
  const result = await adminService.listDisputes({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    statusFilter: statusFilter as any,
  });
  return paginatedResponse(
    res,
    result.disputes,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar sengketa berhasil diambil',
  );
});

/**
 * POST /api/v1/admin/orders/:id/resolve
 */
export const resolveDispute = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { resolution, note } = req.body;
  const result = await adminService.resolveDispute(id, resolution, note, req.user!.id);
  successResponse(res, result, 'Sengketa berhasil diselesaikan oleh Admin');
});

/**
 * GET /api/v1/admin/orders/disputes/:id
 */
export const getDisputeDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const detail = await adminService.getDisputeDetail(id);
  successResponse(res, detail, 'Detail sengketa berhasil diambil');
});

/**
 * GET /api/v1/admin/orders/disputes/:orderId/chat
 */
export const getDisputeChatThread = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;
  const { page = 1, limit = 200 } = req.query;
  const data = await disputeMediationService.getDisputeChatThread(orderId, {
    page: Number(page),
    limit: Number(limit),
  });
  successResponse(res, data, 'Chat mediasi sengketa berhasil diambil');
});

/**
 * POST /api/v1/admin/orders/disputes/:orderId/chat/messages
 */
export const sendDisputeMediationMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;
  const { content } = req.body;
  const message = await disputeMediationService.sendDisputeMediationMessage(
    orderId,
    req.user!.id,
    content,
  );
  successResponse(res, message, 'Pesan mediasi berhasil dikirim');
});

/**
 * POST /api/v1/admin/orders/disputes/:orderId/mediation/start
 */
export const startDisputeMediation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;
  const mediation = await disputeMediationService.startDisputeMediation(orderId, req.user!.id);
  successResponse(res, mediation, 'Mediasi sengketa dimulai');
});

/**
 * POST /api/v1/admin/orders/disputes/:orderId/mediation/ready
 */
export const markDisputeReadyToResolve = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;
  const mediation = await disputeMediationService.markDisputeReadyToResolve(orderId, req.user!.id);
  successResponse(res, mediation, 'Sengketa siap untuk diputus');
});

/**
 * GET /api/v1/admin/finance/stats
 */
export const getFinanceStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await cacheAside(cacheKeys.adminFinanceStats(), CACHE_TTL.ADMIN_ANALYTICS, () =>
    adminService.getFinanceStats(),
  );
  successResponse(res, stats, 'Statistik keuangan berhasil diambil');
});

/**
 * PATCH /api/v1/admin/products/:id/moderate
 */
export const moderateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body as { status: ProductStatus; reason?: string };
  const result = await adminService.moderateProductStatus(id, status, {
    reason,
    adminUserId: req.user!.id,
  });

  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'MODERATE_PRODUCT',
    entity: 'PRODUCT',
    entityId: id,
    oldValue: { status: result.previousStatus },
    newValue: { status, reason: result.reason },
  });

  successResponse(res, result.product, `Status produk berhasil dimoderasi menjadi ${status}`);
});

/**
 * GET /api/v1/admin/finance/fees
 */
export const listFees = catchAsync(async (req: AuthRequest, res: Response) => {
  const fees = await cacheAside(cacheKeys.adminFinanceFees(), CACHE_TTL.ADMIN_GALLERY, () =>
    adminService.listPlatformFees(),
  );
  successResponse(res, fees, 'Pengaturan biaya platform berhasil diambil');
});

/**
 * PATCH /api/v1/admin/finance/fees/:id
 */
export const updateFee = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await adminService.updatePlatformFee(id, req.body);

  // Audit Log — ERR-B003 FIX: Log sanitized fields only, not raw req.body
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'UPDATE_FEE',
    entity: 'PLATFORM_FEE',
    entityId: id,
    newValue: {
      amount: result.amount,
      type: result.type,
      isActive: result.isActive,
    },
  });

  void invalidateAdminAnalytics();
  successResponse(res, result, 'Pengaturan biaya platform berhasil diperbarui');
});

/**
 * POST /api/v1/admin/finance/fees
 */
export const createFee = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await adminService.createPlatformFee(
    req.body as {
      name: PlatformFeeType;
      amount: number;
      type: FeeCalculationType;
      description?: string;
      isActive?: boolean;
    },
  );

  // Audit Log — ERR-B003 FIX: Log sanitized fields only, not raw req.body
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'CREATE_FEE',
    entity: 'PLATFORM_FEE',
    entityId: (result as { id: string }).id,
    newValue: {
      name: (result as any).name,
      amount: (result as any).amount,
      type: (result as any).type,
      isActive: (result as any).isActive,
    },
  });

  successResponse(res, result, 'Pengaturan biaya platform berhasil ditambahkan');
});

/**
 * GET /api/v1/admin/products/categories
 */
export const listCategories = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await adminService.listCategories();
  successResponse(res, result, 'Data kategori berhasil diambil');
});

/**
 * POST /api/v1/admin/products/categories
 */
export const createCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await adminService.createCategory(
    req.body as {
      name: string;
      description?: string;
      categoryType: CATEGORY_TYPE;
    },
  );

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'CREATE_CATEGORY',
    entity: 'CATEGORY',
    entityId: (result as { id: string }).id,
    newValue: req.body,
  });

  successResponse(res, result, 'Kategori berhasil ditambahkan');
});

/**
 * PUT /api/v1/admin/products/categories/:id
 */
export const updateCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await adminService.updateCategory(
    id,
    req.body as {
      name?: string;
      description?: string;
      categoryType?: CATEGORY_TYPE;
    },
  );

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'UPDATE_CATEGORY',
    entity: 'CATEGORY',
    entityId: id,
    newValue: req.body,
  });

  successResponse(res, result, 'Kategori berhasil diperbarui');
});

/**
 * PHASE 5 EXTENSIONS
 */

/**
 * GET /api/v1/admin/notifications/stats
 */
export const getNotificationStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const stats = await adminService.getNotificationAdminStats();
  successResponse(res, stats, 'Statistik notifikasi berhasil diambil');
});

/**
 * GET /api/v1/admin/notifications/history
 */
export const listBroadcastHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await adminService.listBroadcastHistory({ page, limit });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    page,
    limit,
    'Riwayat broadcast berhasil diambil',
  );
});

/**
 * POST /api/v1/admin/notifications/broadcast
 */
export const sendBroadcast = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await adminService.createBroadcast(
    req.body as {
      title: string;
      message: string;
      priority: NotificationPriority;
      targetRole?: UserRole;
    },
    req.user!.id,
  );

  successResponse(res, result, 'Pengumuman broadcast berhasil dikirim ke antrean');
});

/**
 * GET /api/v1/admin/finance/payouts
 */
export const listPayoutQueue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await adminService.getPayoutQueue({
    page: Number(page),
    limit: Number(limit),
  });
  return paginatedResponse(
    res,
    result.transactions,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Antrean penarikan dana berhasil diambil',
  );
});

/**
 * PATCH /api/v1/admin/finance/payouts/:id/approve
 */
export const approvePayout = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, note } = req.body as {
    status: 'COMPLETED' | 'FAILED';
    note?: string;
  };

  const result = await adminService.processPayout(id, status, note, req.user!.id);

  successResponse(
    res,
    result,
    `Penarikan dana berhasil ${status === PayoutStatus.COMPLETED ? 'disetujui' : 'ditolak'}`,
  );
});

/**
 * GET /api/v1/admin/finance/reports/export
 */
export const exportTransactionsCsv = catchAsync(async (req: AuthRequest, res: Response) => {
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  if (!startDate || !endDate) {
    throw new AppError('startDate dan endDate wajib diisi (YYYY-MM-DD)', 400);
  }

  // Validate Date Range (Max 31 Days to prevent OOM)
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Format tanggal tidak valid. Gunakan YYYY-MM-DD', 400);
  }

  const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 31) {
    throw new AppError('Rentang waktu ekspor maksimal adalah 31 hari.', 400);
  }

  const data = await adminService.getExportableTransactions(startDate, endDate);

  const headers = ['ID', 'User', 'Amount', 'Type', 'Status', 'CreatedAt'];
  const rows = data.map((t) => ({
    ID: t.id,
    User: t.user?.fullName || 'N/A',
    Amount: t.amount.toString(),
    Type: t.type,
    Status: t.status,
    CreatedAt: t.createdAt.toISOString(),
  }));

  const csvContent = toCsv(headers, rows);

  res.setHeader('Content-Type', 'text/csv');
  res.attachment(`Laporan_Transaksi_${startDate}_ke_${endDate}.csv`);
  res.status(200).send(csvContent);
});
