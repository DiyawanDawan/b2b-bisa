import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { paginatedResponse, successResponse } from '#utils/response.util';
import * as catalog from '#services/admin-catalog.service';

/* Harvest lots */
export const listHarvestLots = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await catalog.listHarvestLotsAdmin(req.query as never);
  paginatedResponse(
    res,
    result.items,
    result.total,
    result.page,
    result.limit,
    'Daftar batch panen berhasil diambil',
  );
});

export const getHarvestLot = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.getHarvestLotAdmin(req.params.id);
  successResponse(res, item, 'Detail batch panen berhasil diambil');
});

export const archiveHarvestLot = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.archiveHarvestLotAdmin(req.params.id, req.user!.id, req.body?.reason);
  successResponse(res, item, 'Batch panen berhasil diarsipkan');
});

export const restoreHarvestLot = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.restoreHarvestLotAdmin(req.params.id, req.user!.id);
  successResponse(res, item, 'Batch panen dipulihkan dari arsip');
});

/* Collections */
export const listCollections = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await catalog.listCollectionsAdmin(req.query as never);
  paginatedResponse(
    res,
    result.items,
    result.total,
    result.page,
    result.limit,
    'Daftar koleksi produk berhasil diambil',
  );
});

export const getCollection = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.getCollectionAdmin(req.params.id);
  successResponse(res, item, 'Detail koleksi berhasil diambil');
});

export const createCollection = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.createCollectionAdmin(req.body, req.user!.id);
  successResponse(res, item, 'Koleksi berhasil dibuat', 201);
});

export const updateCollection = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.updateCollectionAdmin(req.params.id, req.body, req.user!.id);
  successResponse(res, item, 'Koleksi berhasil diperbarui');
});

export const deleteCollection = catchAsync(async (req: AuthRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
  const item = await catalog.deleteCollectionAdmin(req.params.id, req.user!.id, reason);
  successResponse(res, item, 'Koleksi berhasil dihapus');
});

export const assignCollectionProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.assignCollectionProductsAdmin(
    req.params.id,
    req.body.productIds,
    Boolean(req.body.replace),
    req.user!.id,
  );
  successResponse(res, item, 'Produk koleksi berhasil diperbarui');
});

export const reorderCollectionProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.reorderCollectionProductsAdmin(
    req.params.id,
    req.body.items,
    req.user!.id,
  );
  successResponse(res, item, 'Urutan produk koleksi berhasil diperbarui');
});

/* Store banners */
export const listStoreBanners = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await catalog.listStoreBannersAdmin(req.query as never);
  paginatedResponse(
    res,
    result.items,
    result.total,
    result.page,
    result.limit,
    'Antrean banner toko berhasil diambil',
  );
});

export const getStoreBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.getStoreBannerAdmin(req.params.id);
  successResponse(res, item, 'Detail banner toko berhasil diambil');
});

export const moderateStoreBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.moderateStoreBannerAdmin(req.params.id, req.user!.id, req.body);
  successResponse(res, item, req.body.action === 'APPROVE' ? 'Banner disetujui' : 'Banner ditolak');
});

export const updateStoreBannerSchedule = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.updateStoreBannerScheduleAdmin(req.params.id, req.user!.id, req.body);
  successResponse(res, item, 'Jadwal/status banner diperbarui');
});

export const listStoreBannerHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await catalog.listStoreBannerHistoryAdmin(req.params.id, req.query as never);
  paginatedResponse(
    res,
    result.items,
    result.total,
    result.page,
    result.limit,
    'Histori moderasi banner',
  );
});

/* Product Q&A */
export const listProductQuestions = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await catalog.listProductQuestionsAdmin(req.query as never);
  paginatedResponse(
    res,
    result.items,
    result.total,
    result.page,
    result.limit,
    'Antrean Q&A produk berhasil diambil',
  );
});

export const getProductQuestion = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.getProductQuestionAdmin(req.params.id);
  successResponse(res, item, 'Detail pertanyaan berhasil diambil');
});

export const moderateProductQuestion = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.moderateProductQuestionAdmin(req.params.id, req.user!.id, req.body);
  successResponse(res, item, 'Moderasi pertanyaan berhasil');
});

export const answerProductQuestion = catchAsync(async (req: AuthRequest, res: Response) => {
  const item = await catalog.answerProductQuestionAdmin(
    req.params.id,
    req.user!.id,
    req.body.answer,
  );
  successResponse(res, item, 'Jawaban admin berhasil dikirim');
});
