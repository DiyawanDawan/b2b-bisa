import { z } from 'zod';
import { BiomassaType } from '#prisma';
import {
  paginationQuerySchema,
  queryBoolean,
  idParamSchema,
} from '#validations/admin-query.validation';

export { idParamSchema };

const reasonRequired = (min = 10, max = 500) =>
  z
    .string()
    .trim()
    .min(min, `Alasan minimal ${min} karakter`)
    .max(max, `Alasan maksimal ${max} karakter`);

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');

/* -------------------------------------------------------------------------- */
/* Audit log viewer                                                           */
/* -------------------------------------------------------------------------- */
export const adminListAuditLogsSchema = paginationQuerySchema.extend({
  entity: z.string().trim().max(80).optional(),
  action: z.string().trim().max(120).optional(),
  userId: z.string().uuid().optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export const adminExportAuditLogsSchema = z
  .object({
    dateFrom: dateOnly,
    dateTo: dateOnly,
    entity: z.string().trim().max(80).optional(),
    action: z.string().trim().max(120).optional(),
  })
  .refine(
    (data) => {
      const start = new Date(data.dateFrom).getTime();
      const end = new Date(data.dateTo).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return false;
      return end - start <= 31 * 24 * 60 * 60 * 1000;
    },
    { message: 'Rentang ekspor maksimal 31 hari dan dateTo harus >= dateFrom' },
  );

/* -------------------------------------------------------------------------- */
/* Supplier API keys                                                          */
/* -------------------------------------------------------------------------- */
export const API_KEY_SCOPES = ['products:read', 'inventory:write'] as const;

export const adminListApiKeysSchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'revoked']).optional(),
  userId: z.string().uuid().optional(),
});

export const adminCreateApiKeySchema = z.object({
  userId: z.string().uuid('Supplier userId tidak valid'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).optional(),
});

export const adminRevokeApiKeySchema = z.object({
  reason: reasonRequired(5),
});

export const adminRotateApiKeySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/* -------------------------------------------------------------------------- */
/* Platform bank accounts                                                     */
/* -------------------------------------------------------------------------- */
export const adminListPlatformAccountsSchema = paginationQuerySchema.extend({
  isActive: queryBoolean,
  currency: z.string().trim().max(8).optional(),
});

export const adminCreatePlatformAccountSchema = z.object({
  paymentChannelId: z.string().uuid('paymentChannelId tidak valid'),
  accountNumber: z
    .string()
    .trim()
    .min(4, 'Nomor rekening minimal 4 karakter')
    .max(40)
    .regex(/^[0-9\- ]+$/, 'Nomor rekening hanya boleh angka, spasi, dan strip'),
  accountName: z.string().trim().min(3, 'Nama pemilik minimal 3 karakter').max(120),
  branch: z.string().trim().max(120).nullable().optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency harus kode ISO 3 huruf, mis. IDR')
    .optional(),
  isActive: z.boolean().optional(),
});

export const adminUpdatePlatformAccountSchema = adminCreatePlatformAccountSchema
  .partial()
  .extend({
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((data) => Object.keys(data).some((k) => k !== 'reason'), {
    message: 'Minimal satu field harus diperbarui',
  });

/* -------------------------------------------------------------------------- */
/* AI operations                                                              */
/* -------------------------------------------------------------------------- */
export const adminListAiPredictionsSchema = paginationQuerySchema.extend({
  biomassaType: z.nativeEnum(BiomassaType).optional(),
  grade: z.enum(['A', 'B', 'C']).optional(),
});

/** Konfigurasi runtime AI non-secret — dipetakan ke PlatformSetting `AI_*`. */
export const adminAiConfigSchema = z
  .object({
    assistantEnabled: z.boolean().optional(),
    predictionEnabled: z.boolean().optional(),
    gradeATempMin: z.number().min(0).max(2000).optional(),
    gradeABurnTimeMin: z.number().int().min(0).max(1440).optional(),
    gradeCTempMax: z.number().min(0).max(2000).optional(),
    defaultYield: z.number().min(0).max(100).optional(),
    defaultCOrganik: z.number().min(0).max(100).optional(),
    gradeAYield: z.number().min(0).max(100).optional(),
    gradeACOrganik: z.number().min(0).max(100).optional(),
    gradeCYield: z.number().min(0).max(100).optional(),
    gradeCCOrganik: z.number().min(0).max(100).optional(),
    defaultDosis: z.number().min(0).max(1000).optional(),
    assistantTimeoutMs: z.number().int().min(1000).max(60000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu konfigurasi harus diperbarui',
  });

/* -------------------------------------------------------------------------- */
/* Waste / GIS data sources                                                   */
/* -------------------------------------------------------------------------- */
const queryYear = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}, z.number().int().min(2000).max(2100).optional());

export const adminListWasteDataSchema = paginationQuerySchema.extend({
  province: z.string().trim().max(120).optional(),
  biomassaType: z.nativeEnum(BiomassaType).optional(),
  year: queryYear,
});

const wasteDataBase = z.object({
  province: z.string().trim().min(2, 'Provinsi wajib diisi').max(120),
  regency: z.string().trim().max(120).nullable().optional(),
  biomassaType: z.nativeEnum(BiomassaType, { message: 'Jenis biomassa tidak valid' }),
  volumeTon: z.number().min(0, 'Volume tidak boleh negatif').max(1_000_000_000),
  year: z.number().int().min(2000, 'Tahun minimal 2000').max(2100, 'Tahun maksimal 2100'),
  source: z.string().trim().max(200).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

const latLngPaired = (data: { lat?: number | null; lng?: number | null }) => {
  const hasLat = data.lat !== undefined && data.lat !== null;
  const hasLng = data.lng !== undefined && data.lng !== null;
  return hasLat === hasLng;
};

export const adminCreateWasteDataSchema = wasteDataBase.refine(latLngPaired, {
  message: 'Lat dan Lng harus diisi berpasangan',
});

export const adminUpdateWasteDataSchema = wasteDataBase
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diperbarui',
  })
  .refine(latLngPaired, { message: 'Lat dan Lng harus diisi berpasangan' });

export const adminDeleteWasteDataSchema = z.object({
  reason: reasonRequired(5),
});
