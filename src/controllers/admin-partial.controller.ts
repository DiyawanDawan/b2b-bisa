import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import * as partial from '#services/admin-partial.service';
import * as adminService from '#services/admin.service';
import { ProductStatus } from '#prisma';

/* Orders */
export const updateOrderStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.updateOrderStatusAdmin(
    req.params.id,
    req.body.status,
    req.body.reason,
    req.user!.id,
  );
  successResponse(res, result, 'Status pesanan berhasil diperbarui');
});

export const cancelOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.cancelOrderAdmin(req.params.id, req.body.reason, req.user!.id, {
    refund: Boolean(req.body.refund),
  });
  successResponse(res, result, 'Pesanan berhasil dibatalkan');
});

export const getOrderTimeline = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await partial.getOrderTimelineAdmin(req.params.id, { page, limit });
  successResponse(res, result, 'Timeline pesanan berhasil diambil');
});

/* Products */
export const updateProductMetadata = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await partial.updateProductMetadataAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, product, 'Metadata produk berhasil diperbarui');
});

export const suspendProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const status = (req.body.status as ProductStatus) || ProductStatus.INACTIVE;
  const result = await adminService.moderateProductStatus(req.params.id, status, {
    reason: req.body.reason,
    adminUserId: req.user!.id,
  });
  await adminService.createAuditLog({
    userId: req.user!.id,
    action: 'SUSPEND_PRODUCT',
    entity: 'PRODUCT',
    entityId: req.params.id,
    oldValue: { status: result.previousStatus },
    newValue: { status, reason: result.reason },
  });
  successResponse(res, result.product, `Produk ditangguhkan (${status})`);
});

export const getProductModerationHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await partial.getProductModerationHistory(req.params.id, { page, limit });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Histori moderasi produk',
  );
});

/* Categories */
export const deleteCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
  const result = await partial.deleteCategoryAdmin(req.params.id, req.user!.id, reason);
  successResponse(res, result, 'Kategori berhasil dihapus');
});

export const deactivateCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.deactivateCategoryAdmin(
    req.params.id,
    req.user!.id,
    req.body?.reason,
  );
  successResponse(res, result, 'Kategori dinonaktifkan');
});

export const activateCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.activateCategoryAdmin(req.params.id, req.user!.id);
  successResponse(res, result, 'Kategori diaktifkan kembali');
});

export const mergeCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.mergeCategoryAdmin(
    req.params.id,
    req.body.targetCategoryId,
    req.user!.id,
    req.body?.reason,
  );
  successResponse(res, result, 'Kategori berhasil digabung');
});

/* Policies */
export const createPolicy = catchAsync(async (req: AuthRequest, res: Response) => {
  const policy = await partial.createPolicyAdmin(req.body, req.user!.id);
  successResponse(res, policy, 'Kebijakan berhasil dibuat', 201);
});

export const createPolicyRevision = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.createPolicyRevisionAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, result, 'Revisi kebijakan berhasil dibuat');
});

export const publishPolicy = catchAsync(async (req: AuthRequest, res: Response) => {
  const policy = await partial.publishPolicyAdmin(
    req.params.id,
    Boolean(req.body.publish),
    req.user!.id,
    req.body?.note,
  );
  successResponse(res, policy, req.body.publish ? 'Kebijakan dipublish' : 'Kebijakan di-unpublish');
});

export const previewPolicy = catchAsync(async (req: AuthRequest, res: Response) => {
  const preview = await partial.previewPolicyAdmin(req.params.id);
  successResponse(res, preview, 'Preview kebijakan');
});

export const listPolicyRevisions = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.listPolicyRevisionsAdmin(req.params.id);
  successResponse(res, result, 'Histori revisi kebijakan');
});

/* Forum groups */
export const createForumGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const group = await partial.createForumGroupAdmin(req.body, req.user!.id);
  successResponse(res, group, 'Grup forum berhasil dibuat', 201);
});

export const updateForumGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const group = await partial.updateForumGroupAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, group, 'Grup forum berhasil diperbarui');
});

export const deleteForumGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.deleteForumGroupAdmin(req.params.id, req.user!.id);
  successResponse(res, result, 'Grup forum berhasil dihapus');
});

export const listForumGroupModerators = catchAsync(async (req: AuthRequest, res: Response) => {
  const mods = await partial.listForumGroupModerators(req.params.id);
  successResponse(res, mods, 'Daftar moderator grup');
});

export const addForumGroupModerator = catchAsync(async (req: AuthRequest, res: Response) => {
  const mod = await partial.addForumGroupModerator(
    req.params.id,
    req.body.userId,
    req.user!.id,
    req.body.role,
  );
  successResponse(res, mod, 'Moderator ditambahkan');
});

export const removeForumGroupModerator = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.removeForumGroupModerator(
    req.params.id,
    req.params.userId,
    req.user!.id,
  );
  successResponse(res, result, 'Moderator dihapus');
});

export const moveForumPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const post = await partial.moveForumPostAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, post, 'Post berhasil dipindahkan/dimoderasi');
});

/* Partnerships */
export const approvePartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await partial.approvePartnershipAdmin(
    req.params.id,
    req.user!.id,
    req.body.reason,
    req.body?.note,
  );
  successResponse(res, row, 'Kerjasama disetujui');
});

export const rejectPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await partial.rejectPartnershipAdmin(
    req.params.id,
    req.user!.id,
    req.body.reason,
    req.body?.note,
  );
  successResponse(res, row, 'Kerjasama ditolak');
});

export const cancelPartnership = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await partial.cancelPartnershipAdmin(req.params.id, req.user!.id, req.body.reason);
  successResponse(res, row, 'Kerjasama dibatalkan');
});

export const updatePartnershipNotes = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await partial.updatePartnershipNotesAdmin(
    req.params.id,
    req.body.internalNotes,
    req.user!.id,
  );
  successResponse(res, row, 'Catatan internal disimpan');
});

export const getPartnershipHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.getPartnershipStatusHistory(req.params.id);
  successResponse(res, result, 'Histori status kerjasama');
});

export const downloadPartnershipDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.downloadPartnershipDocument(req.params.id);
  if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
    return successResponse(res, result.document, 'Dokumen kontrak');
  }
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.body);
});

/* Market */
export const listMarketTrendsCrud = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.listMarketTrendsCrud({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
    category: req.query.category as never,
    region: req.query.region as string | undefined,
    isPublished: req.query.isPublished as unknown as boolean | undefined,
    search: req.query.search as string | undefined,
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar tren pasar',
  );
});

export const createMarketTrend = catchAsync(async (req: AuthRequest, res: Response) => {
  const trend = await partial.createMarketTrendAdmin(req.body, req.user!.id);
  successResponse(res, trend, 'Tren pasar dibuat', 201);
});

export const updateMarketTrend = catchAsync(async (req: AuthRequest, res: Response) => {
  const trend = await partial.updateMarketTrendAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, trend, 'Tren pasar diperbarui');
});

export const deleteMarketTrend = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.deleteMarketTrendAdmin(req.params.id, req.user!.id);
  successResponse(res, result, 'Tren pasar dihapus');
});

export const listSupplyDemand = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.listSupplyDemandAdmin({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
    category: req.query.category as string | undefined,
    region: req.query.region as string | undefined,
    isPublished: req.query.isPublished as unknown as boolean | undefined,
    search: req.query.search as string | undefined,
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar snapshot supply-demand',
  );
});

export const createSupplyDemand = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await partial.createSupplyDemandAdmin(req.body, req.user!.id);
  successResponse(res, row, 'Snapshot supply-demand dibuat', 201);
});

export const updateSupplyDemand = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await partial.updateSupplyDemandAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, row, 'Snapshot supply-demand diperbarui');
});

export const deleteSupplyDemand = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await partial.deleteSupplyDemandAdmin(req.params.id, req.user!.id);
  successResponse(res, result, 'Snapshot supply-demand dihapus');
});
