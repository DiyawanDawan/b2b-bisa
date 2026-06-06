import { z } from 'zod';
import {
  UserRole,
  UserStatus,
  VerificationStatus,
  ProductStatus,
  CATEGORY_TYPE,
  TransactionType,
  TransactionStatus,
  PlatformFeeType,
  FeeCalculationType,
  NotificationPriority,
  PayoutStatus,
  OrderStatus,
  NegotiationStatus,
} from '#prisma';

/**
 * Common pagination and search query schema
 */
export const paginationQuerySchema = z.object({
  page: z.preprocess((val) => Number(val), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => Number(val), z.number().int().min(1).max(100).default(10)),
  search: z.string().optional(),
});

/**
 * User Governance Schemas
 */
export const listUsersSchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole, { message: 'Role tidak valid' }).optional(),
  status: z.nativeEnum(UserStatus, { message: 'Status tidak valid' }).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus, { message: 'Status tidak valid' }),
});

/**
 * KYC Governance Schemas
 */
export const listKYCQueueSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(VerificationStatus, { message: 'Status KYC tidak valid' }).optional(),
});

export const updateKYCSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum([VerificationStatus.VERIFIED, VerificationStatus.REJECTED], {
    message: 'Status KYC hanya bisa VERIFIED atau REJECTED',
  }),
  rejectionReason: z.string().optional(),
});

/**
 * Product Moderation Schemas
 */
export const listAllProductsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ProductStatus, { message: 'Status produk tidak valid' }).optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid({ message: 'ID produk tidak valid' }),
});

export const certifyProductSchema = z.object({
  isCertified: z.preprocess(
    (val) => {
      if (val === true || val === 'true' || val === 1 || val === '1') return true;
      if (val === false || val === 'false' || val === 0 || val === '0') return false;
      return val;
    },
    z.boolean({ message: 'isCertified harus boolean (true/false)' }),
  ),
});

const PRODUCT_MODERATION_REASON_MIN = 10;
const PRODUCT_MODERATION_REASON_MAX = 500;

/** Status yang memerlukan alasan dari admin (termasuk blokir / nonaktifkan). */
const PRODUCT_STATUSES_REQUIRING_REASON: ProductStatus[] = [
  ProductStatus.BLOCKED,
  ProductStatus.INACTIVE,
  ProductStatus.DRAFT,
  ProductStatus.OUT_OF_STOCK,
  ProductStatus.DELETED,
];

export const moderateProductSchema = z
  .object({
    status: z.nativeEnum(ProductStatus, { message: 'Status produk tidak valid' }),
    reason: z
      .string()
      .trim()
      .max(PRODUCT_MODERATION_REASON_MAX, {
        message: `Alasan moderasi maksimal ${PRODUCT_MODERATION_REASON_MAX} karakter`,
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!PRODUCT_STATUSES_REQUIRING_REASON.includes(data.status)) {
      return;
    }
    const reason = data.reason?.trim() ?? '';
    if (reason.length < PRODUCT_MODERATION_REASON_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Alasan wajib diisi untuk status ${data.status} (min. ${PRODUCT_MODERATION_REASON_MIN} karakter)`,
        path: ['reason'],
      });
    }
  });

/**
 * Category Master Data Schemas
 */
export const categorySchema = z.object({
  name: z.string().min(2, 'Nama kategori minimal 2 karakter'),
  description: z.string().optional(),
  categoryType: z.nativeEnum(CATEGORY_TYPE, { message: 'Tipe kategori tidak valid' }),
});

/**
 * Finance & Fee Schemas
 */
export const listTransactionsSchema = paginationQuerySchema.extend({
  type: z.nativeEnum(TransactionType, { message: 'Tipe transaksi tidak valid' }).optional(),
  status: z.nativeEnum(TransactionStatus, { message: 'Status transaksi tidak valid' }).optional(),
  search: z.string().optional(),
});

export const feeSchema = z.object({
  name: z.nativeEnum(PlatformFeeType, { message: 'Nama biaya fee tidak valid' }),
  amount: z.number().min(0),
  type: z.nativeEnum(FeeCalculationType, { message: 'Tipe fee tidak valid' }),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateFeeSchema = z.object({
  amount: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Order & Dispute Schemas
 */
export const listDisputesSchema = paginationQuerySchema.extend({
  statusFilter: z.nativeEnum(OrderStatus).optional(),
});

export const resolveDisputeSchema = z.object({
  resolution: z.enum(['RELEASE', 'REFUND'], { message: 'Resolusi hanya bisa RELEASE atau REFUND' }),
  note: z.string().min(5, 'Catatan resolusi wajib diisi minimal 5 karakter'),
});

export const disputeChatQuerySchema = paginationQuerySchema.extend({});

/**
 * Phase 5 Extension Schemas
 */
export const broadcastSchema = z.object({
  title: z.string().min(5, 'Judul pengumuman minimal 5 karakter'),
  message: z.string().min(10, 'Pesan pengumuman minimal 10 karakter'),
  priority: z.nativeEnum(NotificationPriority, { message: 'Prioritas tidak valid' }),
  targetRole: z.nativeEnum(UserRole).optional(),
});

export const approvePayoutSchema = z.object({
  status: z.enum([PayoutStatus.COMPLETED, PayoutStatus.FAILED], {
    message: 'Status payout hanya bisa COMPLETED atau FAILED',
  }),
  note: z.string().optional(),
});

export const listOrdersSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(OrderStatus, { message: 'Status order tidak valid' }).optional(),
  courierCode: z.string().min(2).max(20).optional(),
  deliveryStatus: z.string().min(2).max(50).optional(),
});

export const createRegionSchema = z.object({
  level: z.enum(['country', 'province', 'regency', 'district', 'village']),
  parentId: z.string().uuid().optional(),
  name: z.string().min(2),
  code: z.string().min(2).max(20),
  shortCode: z.string().max(20).optional(),
  continent: z.string().optional(),
  villageType: z.enum(['KELURAHAN', 'DESA']).optional(),
});

export const regionLevelQuerySchema = z.object({
  level: z.enum(['country', 'province', 'regency', 'district', 'village']),
});

export const listRegionsSchema = z.object({
  level: z.enum(['country', 'province', 'regency', 'district', 'village']),
  parentId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const updateRegionSchema = z.object({
  level: z.enum(['country', 'province', 'regency', 'district', 'village']),
  name: z.string().min(2).optional(),
  code: z.string().min(2).max(20).optional(),
  shortCode: z.string().max(20).optional(),
  continent: z.string().optional(),
  villageType: z.enum(['KELURAHAN', 'DESA']).optional(),
});

export const listForumAdminSchema = paginationQuerySchema.extend({
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional(),
});

export const moderateForumSchema = z.object({
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']),
});

export const adminForumCreatePostSchema = z.object({
  title: z.string().min(5, 'Judul minimal 5 karakter').max(150),
  content: z.string().min(10, 'Konten minimal 10 karakter').max(5000),
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional().default('PUBLISHED'),
  categoryId: z.string().uuid('Kategori tidak valid').optional(),
  authorUserId: z.string().uuid('Penulis tidak valid').optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});

export const adminForumUpdatePostSchema = z.object({
  title: z.string().min(5).max(150).optional(),
  content: z.string().max(5000).optional(),
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
});

export const updatePolicySchema = z.object({
  content: z.string().min(10).optional(),
  version: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const listChatInboxSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(NegotiationStatus, { message: 'Status negosiasi tidak valid' }).optional(),
});

export const adminChatMessageSchema = z.object({
  content: z.string().min(1, 'Pesan wajib diisi').max(2000, 'Pesan maksimal 2000 karakter'),
});

const crmStageEnum = z.enum(['LEAD', 'PROSPECT', 'ACTIVE', 'VIP', 'AT_RISK']);

export const listCrmContactsSchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole, { message: 'Role tidak valid' }).optional(),
  stage: crmStageEnum.optional(),
});

export const createCrmNoteSchema = z.object({
  content: z.string().min(1, 'Catatan wajib diisi').max(5000),
  noteType: z.enum(['NOTE', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP']).optional(),
});

export const updateCrmContactSchema = z.object({
  stage: crmStageEnum.optional(),
  nextFollowUpAt: z.union([z.string().min(1), z.null()]).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});
