import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as adminService from '#services/admin.service';
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
  const stats = await adminService.getDashboardStats();
  successResponse(res, stats, 'Statistik dashboard berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/biomass-trend
 */
export const getBiomassTrend = catchAsync(async (req: AuthRequest, res: Response) => {
  const trend = await adminService.getBiomassTrend();
  successResponse(res, trend, 'Data tren biomassa berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/revenue
 */
export const getRevenueAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.getRevenueAnalytics();
  successResponse(res, data, 'Data revenue analytics berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/users
 */
export const getUserAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.getUserAnalytics();
  successResponse(res, data, 'Data user analytics berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/categories
 */
export const getCategoryAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.getCategoryAnalytics();
  successResponse(res, data, 'Data category analytics berhasil diambil');
});

/**
 * GET /api/v1/admin/dashboard/charts/performance
 */
export const getTopSuppliers = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await adminService.getTopSuppliers();
  successResponse(res, data, 'Data top suppliers berhasil diambil');
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
  successResponse(res, result, 'Daftar user berhasil diambil');
});

/**
 * GET /api/v1/admin/users/:id/dossier
 * Dossier 360 derajat user untuk audit
 */
export const getUserDossier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const dossier = await adminService.getUserDossier(id);
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
  successResponse(res, queue, 'Antrean KYC berhasil diambil');
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
  successResponse(res, result, 'Daftar produk berhasil diambil');
});

/**
 * PATCH /api/v1/admin/products/:id/certify
 */
export const certifyProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isCertified } = req.body;
  const result = await adminService.verifyProduct(id, isCertified);

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'CERTIFY_PRODUCT',
    entity: 'PRODUCT',
    entityId: id,
    newValue: { isCertified },
  });

  successResponse(res, result, 'Status sertifikasi produk berhasil diperbarui');
});

/**
 * GET /api/v1/admin/finance/transactions
 */
export const listTransactions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10, type, status } = req.query;
  const result = await adminService.listTransactions({
    page: Number(page),
    limit: Number(limit),
    type: type as TransactionType,
    status: status as TransactionStatus,
  });
  successResponse(res, result, 'Daftar transaksi berhasil diambil');
});

/**
 * GET /api/v1/admin/orders/disputes
 */
export const listDisputes = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await adminService.listDisputes({
    page: Number(page),
    limit: Number(limit),
  });
  successResponse(res, result, 'Daftar sengketa berhasil diambil');
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
 * GET /api/v1/admin/finance/stats
 */
export const getFinanceStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await adminService.getFinanceStats();
  successResponse(res, stats, 'Statistik keuangan berhasil diambil');
});

/**
 * PATCH /api/v1/admin/products/:id/moderate
 */
export const moderateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status: ProductStatus };
  const result = await adminService.updateProductStatus(id, status);

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'MODERATE_PRODUCT',
    entity: 'PRODUCT',
    entityId: id,
    newValue: { status },
  });

  successResponse(res, result, `Status produk berhasil dimoderasi menjadi ${status}`);
});

/**
 * GET /api/v1/admin/finance/fees
 */
export const listFees = catchAsync(async (req: AuthRequest, res: Response) => {
  const fees = await adminService.listPlatformFees();
  successResponse(res, fees, 'Pengaturan biaya platform berhasil diambil');
});

/**
 * PATCH /api/v1/admin/finance/fees/:id
 */
export const updateFee = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await adminService.updatePlatformFee(id, req.body);

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'UPDATE_FEE',
    entity: 'PLATFORM_FEE',
    entityId: id,
    newValue: req.body,
  });

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

  // Audit Log
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'CREATE_FEE',
    entity: 'PLATFORM_FEE',
    entityId: (result as { id: string }).id,
    newValue: req.body,
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
  successResponse(res, result, 'Antrean penarikan dana berhasil diambil');
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
    throw new Error('startDate dan endDate wajib diisi (YYYY-MM-DD)');
  }

  // Validate Date Range (Max 31 Days to prevent OOM)
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Format tanggal tidak valid. Gunakan YYYY-MM-DD');
  }

  const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 31) {
    throw new Error('Rentang waktu ekspor maksimal adalah 31 hari.');
  }

  const data = await adminService.getExportableTransactions(startDate, endDate);

  // CSV Sanitizer: Prevent Excel Formula Injection
  const sanitizeCsvField = (field: string): string => {
    if (/^[=+\-@\t\r]/.test(field)) return `'${field}`;
    if (field.includes(',') || field.includes('\n') || field.includes('"')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  // Manual CSV Generation (Header + Rows)
  const headers = ['ID', 'User', 'Amount', 'Type', 'Status', 'CreatedAt'];
  const rows = data.map((t) => [
    sanitizeCsvField(t.id),
    sanitizeCsvField(t.user?.fullName || 'N/A'),
    sanitizeCsvField(t.amount.toString()),
    sanitizeCsvField(t.type),
    sanitizeCsvField(t.status),
    sanitizeCsvField(t.createdAt.toISOString()),
  ]);

  const csvContent = [headers, ...rows].map((e) => e.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.attachment(`Laporan_Transaksi_${startDate}_ke_${endDate}.csv`);
  res.status(200).send(csvContent);
});
