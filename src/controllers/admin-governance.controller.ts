import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, paginatedResponse } from '#utils/response.util';
import { toCsv } from '#utils/csv.util';
import * as governance from '#services/admin-governance.service';
import { BiomassaType } from '#prisma';

const num = (value: unknown, fallback: number) => Number(value) || fallback;
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const bool = (value: unknown) =>
  value === undefined ? undefined : value === true || value === 'true';

/* ------------------------------ Audit logs -------------------------------- */
export const listAuditLogs = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await governance.listAuditLogsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    entity: str(req.query.entity),
    action: str(req.query.action),
    userId: str(req.query.userId),
    dateFrom: str(req.query.dateFrom),
    dateTo: str(req.query.dateTo),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar audit log',
  );
});

export const getAuditLogMeta = catchAsync(async (_req: AuthRequest, res: Response) => {
  const meta = await governance.getAuditLogMetaAdmin();
  successResponse(res, meta, 'Filter audit log');
});

export const exportAuditLogs = catchAsync(async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, entity, action } = req.query as {
    dateFrom: string;
    dateTo: string;
    entity?: string;
    action?: string;
  };

  const logs = await governance.exportAuditLogsAdmin({ dateFrom, dateTo, entity, action });

  const headers = ['ID', 'Actor', 'Email', 'Action', 'Entity', 'EntityId', 'IP', 'CreatedAt'];
  const rows = logs.map((log) => ({
    ID: log.id,
    Actor: log.user?.fullName ?? 'SYSTEM',
    Email: log.user?.email ?? '',
    Action: log.action,
    Entity: log.entity,
    EntityId: log.entityId ?? '',
    IP: log.ipAddress ?? '',
    CreatedAt: log.createdAt.toISOString(),
  }));

  res.setHeader('Content-Type', 'text/csv');
  res.attachment(`Audit_Log_${dateFrom}_ke_${dateTo}.csv`);
  res.status(200).send(toCsv(headers, rows));
});

export const getAuditLog = catchAsync(async (req: AuthRequest, res: Response) => {
  const log = await governance.getAuditLogAdmin(req.params.id);
  successResponse(res, log, 'Detail audit log');
});

/* ------------------------------- API keys --------------------------------- */
export const listApiKeys = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await governance.listApiKeysAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    status: req.query.status as 'active' | 'revoked' | undefined,
    userId: str(req.query.userId),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar API key supplier',
  );
});

export const createApiKey = catchAsync(async (req: AuthRequest, res: Response) => {
  const record = await governance.createApiKeyAdmin(req.user!.id, req.body);
  successResponse(
    res,
    record,
    'API key dibuat. Simpan secret sekarang — tidak akan ditampilkan lagi.',
    201,
  );
});

export const revokeApiKey = catchAsync(async (req: AuthRequest, res: Response) => {
  const record = await governance.revokeApiKeyAdmin(req.user!.id, req.params.id, req.body.reason);
  successResponse(res, record, 'API key dicabut');
});

export const rotateApiKey = catchAsync(async (req: AuthRequest, res: Response) => {
  const record = await governance.rotateApiKeyAdmin(req.user!.id, req.params.id, req.body.reason);
  successResponse(
    res,
    record,
    'API key dirotasi. Simpan secret baru sekarang — tidak akan ditampilkan lagi.',
  );
});

/* -------------------------- Platform bank accounts ------------------------ */
export const listPlatformAccounts = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await governance.listPlatformAccountsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    isActive: bool(req.query.isActive),
    currency: str(req.query.currency),
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar rekening platform',
  );
});

export const createPlatformAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const account = await governance.createPlatformAccountAdmin(req.user!.id, req.body);
  successResponse(res, account, 'Rekening platform dibuat', 201);
});

export const updatePlatformAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const account = await governance.updatePlatformAccountAdmin(
    req.user!.id,
    req.params.id,
    req.body,
  );
  successResponse(res, account, 'Rekening platform diperbarui');
});

export const getPlatformAccountAudit = catchAsync(async (req: AuthRequest, res: Response) => {
  const logs = await governance.getPlatformAccountAuditAdmin(req.params.id);
  successResponse(res, logs, 'Riwayat perubahan rekening');
});

/* ------------------------------ AI operations ----------------------------- */
export const getAiOperationsOverview = catchAsync(async (_req: AuthRequest, res: Response) => {
  const overview = await governance.getAiOperationsOverviewAdmin();
  successResponse(res, overview, 'Ringkasan operasi AI');
});

export const listAiPredictions = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await governance.listAiPredictionsAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    biomassaType: req.query.biomassaType as BiomassaType | undefined,
    grade: req.query.grade as 'A' | 'B' | 'C' | undefined,
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar prediksi AI',
  );
});

export const updateAiConfig = catchAsync(async (req: AuthRequest, res: Response) => {
  const overview = await governance.updateAiConfigAdmin(req.user!.id, req.body);
  successResponse(res, overview, 'Konfigurasi AI diperbarui');
});

/* --------------------------- Waste data sources --------------------------- */
export const listWasteData = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await governance.listWasteDataAdmin({
    page: num(req.query.page, 1),
    limit: num(req.query.limit, 10),
    search: str(req.query.search),
    province: str(req.query.province),
    biomassaType: req.query.biomassaType as BiomassaType | undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
  });
  return paginatedResponse(
    res,
    result.items,
    result.pagination.total,
    result.pagination.page,
    result.pagination.limit,
    'Daftar data limbah GIS',
  );
});

export const createWasteData = catchAsync(async (req: AuthRequest, res: Response) => {
  const record = await governance.createWasteDataAdmin(req.user!.id, req.body);
  successResponse(res, record, 'Data limbah dibuat', 201);
});

export const updateWasteData = catchAsync(async (req: AuthRequest, res: Response) => {
  const record = await governance.updateWasteDataAdmin(req.user!.id, req.params.id, req.body);
  successResponse(res, record, 'Data limbah diperbarui');
});

export const deleteWasteData = catchAsync(async (req: AuthRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
  const result = await governance.deleteWasteDataAdmin(req.user!.id, req.params.id, reason);
  successResponse(res, result, 'Data limbah dihapus');
});

/* ------------------------- Operational analytics -------------------------- */
export const getOperationsKpis = catchAsync(async (_req: AuthRequest, res: Response) => {
  const kpis = await governance.getOperationsKpisAdmin();
  successResponse(res, kpis, 'KPI operasional lintas domain');
});
