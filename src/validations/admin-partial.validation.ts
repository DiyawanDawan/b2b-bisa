import { z } from 'zod';
import { OrderStatus, ProductStatus, PartnershipStatus, TrendType, TrendCategory } from '#prisma';
import {
  paginationQuerySchema,
  queryBoolean,
  idParamSchema,
} from '#validations/admin-query.validation';
import { sanitizeProductDescriptionHtml } from '#utils/htmlSanitize.util';

export { idParamSchema };

const reasonRequired = (min = 10, max = 500) =>
  z
    .string()
    .trim()
    .min(min, `Alasan minimal ${min} karakter`)
    .max(max, `Alasan maksimal ${max} karakter`);

const optionalReason = z.string().trim().max(500).optional();

/** Orders */
export const adminUpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus, { message: 'Status order tidak valid' }),
  reason: reasonRequired(5),
});

export const adminCancelOrderSchema = z.object({
  reason: reasonRequired(10),
  refund: z.boolean().optional().default(false),
});

export const adminOrderTimelineQuerySchema = paginationQuerySchema;

/** Products */
const adminProductDescriptionSchema = z.union([
  z
    .string()
    .max(20000, 'Deskripsi terlalu panjang')
    .transform((value) => sanitizeProductDescriptionHtml(value) ?? null),
  z.null(),
]);

export const adminUpdateProductMetadataSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: adminProductDescriptionSchema.optional(),
    categoryId: z.string().uuid().nullable().optional(),
    pricePerUnit: z.number().positive().optional(),
    minOrder: z.number().positive().optional(),
    province: z.string().trim().max(120).nullable().optional(),
    regency: z.string().trim().max(120).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field metadata harus diperbarui',
  });

export const adminSuspendProductSchema = z.object({
  reason: reasonRequired(10),
  status: z
    .enum([ProductStatus.INACTIVE, ProductStatus.BLOCKED, ProductStatus.DRAFT])
    .optional()
    .default(ProductStatus.INACTIVE),
});

export const adminProductModerationHistoryQuerySchema = paginationQuerySchema;

/** Categories */
export const adminDeactivateCategorySchema = z.object({
  reason: optionalReason,
});

export const adminMergeCategorySchema = z.object({
  targetCategoryId: z.string().uuid({ message: 'Kategori tujuan tidak valid' }),
  reason: optionalReason,
});

/** Policies */
export const adminCreatePolicySchema = z.object({
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(10),
  version: z.string().trim().min(1).max(40).optional().default('1.0.0'),
  isActive: z.boolean().optional().default(false),
  note: z.string().trim().max(500).optional(),
});

export const adminPublishPolicySchema = z.object({
  publish: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export const adminCreatePolicyRevisionSchema = z.object({
  content: z.string().trim().min(10),
  version: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
  publish: z.boolean().optional().default(false),
});

/** Forum groups */
export const adminCreateForumGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional(),
  isPublic: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
  ownerId: z.string().uuid().optional(),
  avatarUrl: z.string().max(2000).optional(),
  bannerUrl: z.string().max(2000).optional(),
});

export const adminUpdateForumGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isPublic: z.boolean().optional(),
    isActive: z.boolean().optional(),
    avatarUrl: z.string().max(2000).nullable().optional(),
    bannerUrl: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diperbarui',
  });

export const adminForumModeratorSchema = z.object({
  userId: z.string().uuid({ message: 'User ID tidak valid' }),
  role: z.enum(['ADMIN', 'MEMBER']).optional().default('ADMIN'),
});

export const adminMoveForumPostSchema = z.object({
  groupId: z.string().uuid({ message: 'Grup tujuan tidak valid' }).nullable(),
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional(),
  reason: optionalReason,
});

/** Partnerships */
export const adminPartnershipDecisionSchema = z.object({
  reason: reasonRequired(5),
  note: z.string().trim().max(2000).optional(),
});

export const adminPartnershipCancelSchema = z.object({
  reason: reasonRequired(10),
});

export const adminPartnershipNotesSchema = z.object({
  internalNotes: z.string().trim().max(5000),
});

/** Market */
export const adminMarketTrendSchema = z.object({
  label: z.string().trim().min(2).max(120),
  currentValue: z.string().trim().min(1).max(40),
  trendType: z.nativeEnum(TrendType),
  category: z.nativeEnum(TrendCategory),
  historyData: z.array(z.number()).max(365).optional(),
  period: z.string().trim().max(40).optional(),
  region: z.string().trim().max(120).optional(),
  commodity: z.string().trim().max(120).optional(),
  source: z.string().trim().max(200).optional(),
  isPublished: z.boolean().optional().default(true),
});

export const adminUpdateMarketTrendSchema = adminMarketTrendSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diperbarui',
  });

export const adminListMarketTrendsSchema = paginationQuerySchema.extend({
  category: z.nativeEnum(TrendCategory).optional(),
  region: z.string().optional(),
  isPublished: queryBoolean,
  search: z.string().optional(),
});

export const adminSupplyDemandSchema = z.object({
  label: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(40).optional().default('BIOMASSA'),
  biomassaType: z.string().trim().max(40).nullable().optional(),
  grade: z.string().trim().max(40).nullable().optional(),
  productCount: z.number().int().min(0).optional(),
  listingCount: z.number().int().min(0).optional(),
  totalStockKg: z.number().int().min(0).optional(),
  totalStockTon: z.number().min(0).optional(),
  provinceCount: z.number().int().min(0).optional(),
  orderCount30d: z.number().int().min(0).optional(),
  orderCount90d: z.number().int().min(0).optional(),
  openOrderCount: z.number().int().min(0).optional(),
  quantityKg30d: z.number().int().min(0).optional(),
  quantityKg90d: z.number().int().min(0).optional(),
  quantityTon90d: z.number().min(0).optional(),
  completedQuantityKg90d: z.number().int().min(0).optional(),
  supplyDemandRatio: z.number().min(0).nullable().optional(),
  balance: z.string().trim().max(40).optional(),
  period: z.string().trim().max(40).optional(),
  region: z.string().trim().max(120).optional(),
  source: z.string().trim().max(200).optional(),
  isPublished: z.boolean().optional().default(true),
});

export const adminUpdateSupplyDemandSchema = adminSupplyDemandSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diperbarui',
  });

export const adminListSupplyDemandSchema = paginationQuerySchema.extend({
  category: z.string().optional(),
  region: z.string().optional(),
  isPublished: queryBoolean,
  search: z.string().optional(),
});

export const partnershipStatusEnum = z.nativeEnum(PartnershipStatus);
