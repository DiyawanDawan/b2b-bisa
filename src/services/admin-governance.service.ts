import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { Prisma, BiomassaType, KnowledgeDocStatus, UserRole } from '#prisma';
import { createAuditLog } from '#services/admin.service';
import { isChromaConfigured } from '#services/chroma.service';
import {
  GOOGLE_GEMINI_API_KEY,
  DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL,
  ML_PREDICT_ENABLED,
  ML_SERVICE_URL,
  CHROMA_DATABASE,
  CHROMA_COLLECTION,
  AUDIT_RETENTION_DAYS,
} from '#utils/env.util';

const partySelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} as const;

const pageMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / Math.max(1, limit)),
});

/* ========================================================================== */
/* Audit log viewer                                                           */
/* ========================================================================== */

export const listAuditLogsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  entity?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}) => {
  const { page, limit, search, entity, action, userId, dateFrom, dateTo } = params;
  const skip = (page - 1) * limit;

  const createdAt: Prisma.DateTimeFilter = {};
  if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);

  const where: Prisma.AuditLogWhereInput = {
    ...(entity && { entity }),
    ...(action && { action }),
    ...(userId && { userId }),
    ...((dateFrom || dateTo) && { createdAt }),
    ...(search && {
      OR: [
        { action: { contains: search } },
        { entity: { contains: search } },
        { entityId: { contains: search } },
        { user: { fullName: { contains: search } } },
        { user: { email: { contains: search } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: partySelect } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, pagination: pageMeta(total, page, limit) };
};

export const getAuditLogAdmin = async (id: string) => {
  const log = await prisma.auditLog.findUnique({
    where: { id },
    include: { user: { select: partySelect } },
  });
  if (!log) throw new AppError('Audit log tidak ditemukan', 404);
  return log;
};

/** Daftar entity & action unik untuk dropdown filter viewer. */
export const getAuditLogMetaAdmin = async () => {
  const [entities, actions, oldest] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ['entity'],
      select: { entity: true },
      orderBy: { entity: 'asc' },
      take: 200,
    }),
    prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
      take: 500,
    }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);
  return {
    entities: entities.map((e) => e.entity),
    actions: actions.map((a) => a.action),
    retentionDays: AUDIT_RETENTION_DAYS,
    oldestCreatedAt: oldest?.createdAt?.toISOString() ?? null,
  };
};

const AUDIT_EXPORT_MAX_ROWS = 5000;

export const exportAuditLogsAdmin = async (params: {
  dateFrom: string;
  dateTo: string;
  entity?: string;
  action?: string;
}) => {
  const { dateFrom, dateTo, entity, action } = params;
  return prisma.auditLog.findMany({
    where: {
      createdAt: {
        gte: new Date(`${dateFrom}T00:00:00.000Z`),
        lte: new Date(`${dateTo}T23:59:59.999Z`),
      },
      ...(entity && { entity }),
      ...(action && { action }),
    },
    orderBy: { createdAt: 'asc' },
    take: AUDIT_EXPORT_MAX_ROWS,
    include: { user: { select: { fullName: true, email: true } } },
  });
};

/* ========================================================================== */
/* Supplier API keys                                                          */
/* ========================================================================== */

const API_KEY_DEFAULT_SCOPES = ['products:read', 'inventory:write'];
const BCRYPT_ROUNDS = 10;

const generateRawApiKey = () => `bisa_erp_${crypto.randomBytes(24).toString('hex')}`;

const apiKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  isActive: true,
  revokedAt: true,
  rotatedAt: true,
  createdAt: true,
  user: { select: partySelect },
} as const;

export const listApiKeysAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: 'active' | 'revoked';
  userId?: string;
}) => {
  const { page, limit, search, status, userId } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.SupplierApiKeyWhereInput = {
    ...(status && { isActive: status === 'active' }),
    ...(userId && { userId }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { keyPrefix: { contains: search } },
        { user: { fullName: { contains: search } } },
        { user: { email: { contains: search } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.supplierApiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: apiKeySelect,
    }),
    prisma.supplierApiKey.count({ where }),
  ]);

  return {
    items: items.map((key) => ({ ...key, maskedKey: `${key.keyPrefix}••••••••` })),
    pagination: pageMeta(total, page, limit),
  };
};

export const createApiKeyAdmin = async (
  adminId: string,
  data: { userId: string; name: string; scopes?: string[] },
) => {
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, fullName: true, role: true },
  });
  if (!user) throw new AppError('Supplier tidak ditemukan', 404);
  if (user.role !== UserRole.SUPPLIER) {
    throw new AppError('API key hanya dapat dibuat untuk user dengan role SUPPLIER', 400);
  }

  const rawKey = generateRawApiKey();
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  const keyPrefix = rawKey.slice(0, 16);
  const scopes = data.scopes?.length ? data.scopes : API_KEY_DEFAULT_SCOPES;

  const record = await prisma.supplierApiKey.create({
    data: {
      userId: data.userId,
      name: data.name,
      keyHash,
      keyPrefix,
      scopes,
    },
    select: apiKeySelect,
  });

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_SUPPLIER_API_KEY',
    entity: 'SUPPLIER_API_KEY',
    entityId: record.id,
    newValue: { name: data.name, keyPrefix, scopes, supplierId: data.userId },
  });

  // Plaintext hanya dikirim sekali di respons ini; tidak pernah disimpan/diaudit.
  return { ...record, maskedKey: `${keyPrefix}••••••••`, apiKey: rawKey };
};

export const revokeApiKeyAdmin = async (adminId: string, id: string, reason: string) => {
  const key = await prisma.supplierApiKey.findUnique({
    where: { id },
    select: { id: true, name: true, keyPrefix: true, isActive: true, userId: true },
  });
  if (!key) throw new AppError('API key tidak ditemukan', 404);
  if (!key.isActive) throw new AppError('API key sudah dicabut', 400);

  const updated = await prisma.supplierApiKey.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
    select: apiKeySelect,
  });

  await createAuditLog({
    userId: adminId,
    action: 'REVOKE_SUPPLIER_API_KEY',
    entity: 'SUPPLIER_API_KEY',
    entityId: id,
    oldValue: { isActive: true },
    newValue: { isActive: false, reason, keyPrefix: key.keyPrefix },
  });

  return { ...updated, maskedKey: `${updated.keyPrefix}••••••••` };
};

export const rotateApiKeyAdmin = async (adminId: string, id: string, reason?: string) => {
  const key = await prisma.supplierApiKey.findUnique({
    where: { id },
    select: { id: true, name: true, keyPrefix: true, isActive: true },
  });
  if (!key) throw new AppError('API key tidak ditemukan', 404);
  if (!key.isActive) throw new AppError('API key yang sudah dicabut tidak dapat dirotasi', 400);

  const rawKey = generateRawApiKey();
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  const keyPrefix = rawKey.slice(0, 16);

  const updated = await prisma.supplierApiKey.update({
    where: { id },
    data: { keyHash, keyPrefix, rotatedAt: new Date() },
    select: apiKeySelect,
  });

  await createAuditLog({
    userId: adminId,
    action: 'ROTATE_SUPPLIER_API_KEY',
    entity: 'SUPPLIER_API_KEY',
    entityId: id,
    oldValue: { keyPrefix: key.keyPrefix },
    newValue: { keyPrefix, reason: reason ?? null },
  });

  return { ...updated, maskedKey: `${keyPrefix}••••••••`, apiKey: rawKey };
};

/* ========================================================================== */
/* Platform bank accounts                                                     */
/* ========================================================================== */

const platformAccountInclude = {
  paymentChannel: {
    select: { id: true, name: true, code: true, group: true, currency: true },
  },
} as const;

export const listPlatformAccountsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  currency?: string;
}) => {
  const { page, limit, search, isActive, currency } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.PlatformBankAccountWhereInput = {
    ...(isActive !== undefined && { isActive }),
    ...(currency && { currency }),
    ...(search && {
      OR: [
        { accountNumber: { contains: search } },
        { accountName: { contains: search } },
        { branch: { contains: search } },
        { paymentChannel: { name: { contains: search } } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.platformBankAccount.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: platformAccountInclude,
    }),
    prisma.platformBankAccount.count({ where }),
  ]);

  return { items, pagination: pageMeta(total, page, limit) };
};

export const createPlatformAccountAdmin = async (
  adminId: string,
  data: {
    paymentChannelId: string;
    accountNumber: string;
    accountName: string;
    branch?: string | null;
    currency?: string;
    isActive?: boolean;
  },
) => {
  const channel = await prisma.paymentChannel.findUnique({
    where: { id: data.paymentChannelId },
    select: { id: true, name: true },
  });
  if (!channel) throw new AppError('Payment channel tidak ditemukan', 404);

  const account = await prisma.platformBankAccount.create({
    data: {
      paymentChannelId: data.paymentChannelId,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      branch: data.branch ?? null,
      currency: data.currency ?? 'IDR',
      isActive: data.isActive ?? true,
    },
    include: platformAccountInclude,
  });

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_PLATFORM_BANK_ACCOUNT',
    entity: 'PLATFORM_BANK_ACCOUNT',
    entityId: account.id,
    newValue: {
      paymentChannel: channel.name,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      currency: account.currency,
      isActive: account.isActive,
    },
  });

  return account;
};

export const updatePlatformAccountAdmin = async (
  adminId: string,
  id: string,
  data: {
    paymentChannelId?: string;
    accountNumber?: string;
    accountName?: string;
    branch?: string | null;
    currency?: string;
    isActive?: boolean;
    reason?: string;
  },
) => {
  const existing = await prisma.platformBankAccount.findUnique({
    where: { id },
    include: platformAccountInclude,
  });
  if (!existing) throw new AppError('Rekening platform tidak ditemukan', 404);

  if (data.paymentChannelId && data.paymentChannelId !== existing.paymentChannelId) {
    const channel = await prisma.paymentChannel.findUnique({
      where: { id: data.paymentChannelId },
      select: { id: true },
    });
    if (!channel) throw new AppError('Payment channel tidak ditemukan', 404);
  }

  const { reason, ...fields } = data;

  const updated = await prisma.platformBankAccount.update({
    where: { id },
    data: {
      ...(fields.paymentChannelId !== undefined && { paymentChannelId: fields.paymentChannelId }),
      ...(fields.accountNumber !== undefined && { accountNumber: fields.accountNumber }),
      ...(fields.accountName !== undefined && { accountName: fields.accountName }),
      ...(fields.branch !== undefined && { branch: fields.branch }),
      ...(fields.currency !== undefined && { currency: fields.currency }),
      ...(fields.isActive !== undefined && { isActive: fields.isActive }),
    },
    include: platformAccountInclude,
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_PLATFORM_BANK_ACCOUNT',
    entity: 'PLATFORM_BANK_ACCOUNT',
    entityId: id,
    oldValue: {
      paymentChannelId: existing.paymentChannelId,
      accountNumber: existing.accountNumber,
      accountName: existing.accountName,
      branch: existing.branch,
      currency: existing.currency,
      isActive: existing.isActive,
    },
    newValue: { ...fields, ...(reason ? { reason } : {}) } as Prisma.InputJsonValue,
  });

  return updated;
};

/** Riwayat perubahan satu rekening dari audit log. */
export const getPlatformAccountAuditAdmin = async (id: string) => {
  const account = await prisma.platformBankAccount.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!account) throw new AppError('Rekening platform tidak ditemukan', 404);

  return prisma.auditLog.findMany({
    where: { entity: 'PLATFORM_BANK_ACCOUNT', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: partySelect } },
  });
};

/* ========================================================================== */
/* AI operations                                                              */
/* ========================================================================== */

/** PlatformSetting keys untuk toggle & konfigurasi runtime AI (non-secret). */
export const AI_FEATURE_KEYS = {
  assistantEnabled: 'AI_ASSISTANT_ENABLED',
  predictionEnabled: 'AI_PREDICTION_ENABLED',
} as const;

const AI_NUMERIC_KEYS = {
  gradeATempMin: 'AI_TEMP_GRADE_A_MIN',
  gradeABurnTimeMin: 'AI_BURN_TIME_GRADE_A_MIN',
  gradeCTempMax: 'AI_TEMP_GRADE_C_MAX',
  defaultYield: 'AI_DEFAULT_YIELD',
  defaultCOrganik: 'AI_DEFAULT_C_ORGANIC',
  gradeAYield: 'AI_GRADE_A_YIELD',
  gradeACOrganik: 'AI_GRADE_A_C_ORGANIC',
  gradeCYield: 'AI_GRADE_C_YIELD',
  gradeCCOrganik: 'AI_GRADE_C_C_ORGANIC',
  defaultDosis: 'AI_DEFAULT_DOSIS_TON_HA',
  assistantTimeoutMs: 'AI_ASSISTANT_TIMEOUT_MS',
} as const;

const AI_NUMERIC_DEFAULTS: Record<keyof typeof AI_NUMERIC_KEYS, number> = {
  gradeATempMin: 450,
  gradeABurnTimeMin: 120,
  gradeCTempMax: 300,
  defaultYield: 30.5,
  defaultCOrganik: 65,
  gradeAYield: 25,
  gradeACOrganik: 80,
  gradeCYield: 40,
  gradeCCOrganik: 45,
  defaultDosis: 5,
  assistantTimeoutMs: 10000,
};

const readAiSettings = async () => {
  const keys = [...Object.values(AI_NUMERIC_KEYS), ...Object.values(AI_FEATURE_KEYS)];
  const settings = await prisma.platformSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  return new Map(settings.map((s) => [s.key, s.value]));
};

export const getAiOperationsOverviewAdmin = async () => {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    settings,
    totalPredictions,
    predictions7d,
    predictions30d,
    fallback30d,
    byGrade,
    knowledgeByStatus,
    knowledgeChunks,
    lastPrediction,
  ] = await Promise.all([
    readAiSettings(),
    prisma.aIPrediction.count(),
    prisma.aIPrediction.count({ where: { createdAt: { gte: d7 } } }),
    prisma.aIPrediction.count({ where: { createdAt: { gte: d30 } } }),
    prisma.aIPrediction.count({
      where: { createdAt: { gte: d30 }, rawOutput: { contains: 'rule-based-fallback' } },
    }),
    prisma.aIPrediction.groupBy({
      by: ['predictedGrade'],
      _count: { _all: true },
    }),
    prisma.knowledgeDocument.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.knowledgeDocument.aggregate({ _sum: { chunkCount: true } }),
    prisma.aIPrediction.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const boolSetting = (key: string, fallback = true) => {
    const raw = settings.get(key);
    return raw === undefined ? fallback : raw === 'true';
  };
  const numberSetting = (field: keyof typeof AI_NUMERIC_KEYS) => {
    const raw = Number(settings.get(AI_NUMERIC_KEYS[field]));
    return Number.isFinite(raw) ? raw : AI_NUMERIC_DEFAULTS[field];
  };

  const knowledgeStatusCount = (status: KnowledgeDocStatus) =>
    knowledgeByStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    generatedAt: now.toISOString(),
    providers: {
      gemini: { configured: Boolean(GOOGLE_GEMINI_API_KEY) },
      deepseek: { configured: Boolean(DEEPSEEK_API_KEY), model: DEEPSEEK_MODEL },
      chroma: {
        configured: isChromaConfigured(),
        database: CHROMA_DATABASE,
        collection: CHROMA_COLLECTION,
      },
      mlService: {
        enabled: ML_PREDICT_ENABLED,
        urlConfigured: Boolean(ML_SERVICE_URL),
      },
    },
    usage: {
      totalPredictions,
      predictions7d,
      predictions30d,
      fallback30d,
      fallbackRate30d: predictions30d === 0 ? 0 : Math.round((fallback30d / predictions30d) * 100),
      byGrade: byGrade.map((row) => ({
        grade: row.predictedGrade,
        count: row._count._all,
      })),
      lastPredictionAt: lastPrediction?.createdAt ?? null,
    },
    knowledge: {
      indexed: knowledgeStatusCount(KnowledgeDocStatus.INDEXED),
      pending: knowledgeStatusCount(KnowledgeDocStatus.PENDING),
      failed: knowledgeStatusCount(KnowledgeDocStatus.FAILED),
      totalChunks: knowledgeChunks._sum.chunkCount ?? 0,
    },
    features: {
      assistantEnabled: boolSetting(AI_FEATURE_KEYS.assistantEnabled),
      predictionEnabled: boolSetting(AI_FEATURE_KEYS.predictionEnabled),
    },
    runtimeConfig: {
      gradeATempMin: numberSetting('gradeATempMin'),
      gradeABurnTimeMin: numberSetting('gradeABurnTimeMin'),
      gradeCTempMax: numberSetting('gradeCTempMax'),
      defaultYield: numberSetting('defaultYield'),
      defaultCOrganik: numberSetting('defaultCOrganik'),
      gradeAYield: numberSetting('gradeAYield'),
      gradeACOrganik: numberSetting('gradeACOrganik'),
      gradeCYield: numberSetting('gradeCYield'),
      gradeCCOrganik: numberSetting('gradeCCOrganik'),
      defaultDosis: numberSetting('defaultDosis'),
      assistantTimeoutMs: numberSetting('assistantTimeoutMs'),
    },
  };
};

export const listAiPredictionsAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  biomassaType?: BiomassaType;
  grade?: 'A' | 'B' | 'C';
}) => {
  const { page, limit, search, biomassaType, grade } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AIPredictionWhereInput = {
    ...(biomassaType && { biomassaType }),
    ...(grade && { predictedGrade: grade }),
    ...(search && {
      user: {
        OR: [{ fullName: { contains: search } }, { email: { contains: search } }],
      },
    }),
  };

  const [items, total] = await Promise.all([
    prisma.aIPrediction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: partySelect } },
    }),
    prisma.aIPrediction.count({ where }),
  ]);

  return {
    items: items.map((p) => ({
      ...p,
      isFallback: Boolean(p.rawOutput?.includes('rule-based-fallback')),
    })),
    pagination: pageMeta(total, page, limit),
  };
};

export const updateAiConfigAdmin = async (
  adminId: string,
  payload: Partial<Record<keyof typeof AI_NUMERIC_KEYS, number>> & {
    assistantEnabled?: boolean;
    predictionEnabled?: boolean;
  },
) => {
  const previous = await readAiSettings();

  const updates: { key: string; value: string }[] = [];
  (Object.keys(AI_NUMERIC_KEYS) as (keyof typeof AI_NUMERIC_KEYS)[]).forEach((field) => {
    const value = payload[field];
    if (value !== undefined) updates.push({ key: AI_NUMERIC_KEYS[field], value: String(value) });
  });
  if (payload.assistantEnabled !== undefined) {
    updates.push({
      key: AI_FEATURE_KEYS.assistantEnabled,
      value: String(payload.assistantEnabled),
    });
  }
  if (payload.predictionEnabled !== undefined) {
    updates.push({
      key: AI_FEATURE_KEYS.predictionEnabled,
      value: String(payload.predictionEnabled),
    });
  }

  await prisma.$transaction(
    updates.map(({ key, value }) =>
      prisma.platformSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_AI_CONFIG',
    entity: 'AI_CONFIG',
    oldValue: Object.fromEntries(
      updates.map(({ key }) => [key, previous.get(key) ?? null]),
    ) as Prisma.InputJsonValue,
    newValue: Object.fromEntries(updates.map(({ key, value }) => [key, value])),
  });

  return getAiOperationsOverviewAdmin();
};

/* ========================================================================== */
/* Waste / GIS data sources                                                   */
/* ========================================================================== */

export const listWasteDataAdmin = async (params: {
  page: number;
  limit: number;
  search?: string;
  province?: string;
  biomassaType?: BiomassaType;
  year?: number;
}) => {
  const { page, limit, search, province, biomassaType, year } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.WasteDataWhereInput = {
    ...(province && { province: { contains: province } }),
    ...(biomassaType && { biomassaType }),
    ...(year && { year }),
    ...(search && {
      OR: [
        { province: { contains: search } },
        { regency: { contains: search } },
        { source: { contains: search } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.wasteData.findMany({
      where,
      orderBy: [{ year: 'desc' }, { province: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.wasteData.count({ where }),
  ]);

  return { items, pagination: pageMeta(total, page, limit) };
};

type WasteDataPayload = {
  province: string;
  regency?: string | null;
  biomassaType: BiomassaType;
  volumeTon: number;
  year: number;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const createWasteDataAdmin = async (adminId: string, data: WasteDataPayload) => {
  const record = await prisma.wasteData.create({
    data: {
      province: data.province,
      regency: data.regency ?? null,
      biomassaType: data.biomassaType,
      volumeTon: data.volumeTon,
      year: data.year,
      source: data.source ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'CREATE_WASTE_DATA',
    entity: 'WASTE_DATA',
    entityId: record.id,
    newValue: {
      province: data.province,
      biomassaType: data.biomassaType,
      volumeTon: data.volumeTon,
      year: data.year,
    },
  });

  return record;
};

export const updateWasteDataAdmin = async (
  adminId: string,
  id: string,
  data: Partial<WasteDataPayload>,
) => {
  const existing = await prisma.wasteData.findUnique({ where: { id } });
  if (!existing) throw new AppError('Data limbah tidak ditemukan', 404);

  const updated = await prisma.wasteData.update({
    where: { id },
    data: {
      ...(data.province !== undefined && { province: data.province }),
      ...(data.regency !== undefined && { regency: data.regency }),
      ...(data.biomassaType !== undefined && { biomassaType: data.biomassaType }),
      ...(data.volumeTon !== undefined && { volumeTon: data.volumeTon }),
      ...(data.year !== undefined && { year: data.year }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.lat !== undefined && { lat: data.lat }),
      ...(data.lng !== undefined && { lng: data.lng }),
    },
  });

  await createAuditLog({
    userId: adminId,
    action: 'UPDATE_WASTE_DATA',
    entity: 'WASTE_DATA',
    entityId: id,
    oldValue: {
      province: existing.province,
      regency: existing.regency,
      biomassaType: existing.biomassaType,
      volumeTon: existing.volumeTon.toString(),
      year: existing.year,
      source: existing.source,
    },
    newValue: data as Prisma.InputJsonValue,
  });

  return updated;
};

export const deleteWasteDataAdmin = async (adminId: string, id: string, reason?: string) => {
  const existing = await prisma.wasteData.findUnique({ where: { id } });
  if (!existing) throw new AppError('Data limbah tidak ditemukan', 404);

  await prisma.wasteData.delete({ where: { id } });

  await createAuditLog({
    userId: adminId,
    action: 'DELETE_WASTE_DATA',
    entity: 'WASTE_DATA',
    entityId: id,
    oldValue: {
      province: existing.province,
      regency: existing.regency,
      biomassaType: existing.biomassaType,
      volumeTon: existing.volumeTon.toString(),
      year: existing.year,
    },
    newValue: reason?.trim() ? { reason: reason.trim() } : undefined,
  });

  return { id };
};

/* ========================================================================== */
/* Operational analytics (cross-domain KPIs)                                  */
/* ========================================================================== */

export const getOperationsKpisAdmin = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    rfqTotal,
    rfqOpen,
    bookingTotal,
    bookingActive,
    reviewFlagged,
    reviewHidden,
    referralPending,
    liveNow,
    liveScheduled,
    voucherActive,
    expressInTransit,
    expressDeliveredThisMonth,
    driversActive,
  ] = await Promise.all([
    prisma.rfq.count(),
    prisma.rfq.count({ where: { status: 'OPEN' } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } } }),
    prisma.review.count({ where: { isFlagged: true } }),
    prisma.review.count({ where: { isHidden: true } }),
    prisma.referralReward.count({ where: { status: 'PENDING' } }),
    prisma.liveSession.count({ where: { status: 'LIVE' } }),
    prisma.liveSession.count({ where: { status: 'SCHEDULED' } }),
    prisma.voucher.count({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    }),
    prisma.bisaExpressShipment.count({
      where: {
        status: {
          in: [
            'PICKUP_ASSIGNED',
            'PICKED_UP',
            'IN_TRANSIT_TO_HUB',
            'AT_ORIGIN_HUB',
            'IN_TRANSIT',
            'AT_DESTINATION_HUB',
            'OUT_FOR_DELIVERY',
          ],
        },
      },
    }),
    prisma.bisaExpressShipment.count({
      where: { status: 'DELIVERED', deliveredAt: { gte: startOfMonth } },
    }),
    prisma.bisaExpressDriver.count({
      where: { status: { notIn: ['OFF_DUTY', 'SUSPENDED'] } },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    rfq: { total: rfqTotal, open: rfqOpen },
    bookings: { total: bookingTotal, active: bookingActive },
    reviews: { flagged: reviewFlagged, hidden: reviewHidden },
    referrals: { pendingRewards: referralPending },
    liveSessions: { live: liveNow, scheduled: liveScheduled },
    vouchers: { active: voucherActive },
    express: {
      inTransit: expressInTransit,
      deliveredThisMonth: expressDeliveredThisMonth,
      activeDrivers: driversActive,
    },
  };
};
