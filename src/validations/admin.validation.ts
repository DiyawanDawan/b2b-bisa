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
} from '#prisma';

/**
 * Common pagination and search query schema
 */
const paginationQuerySchema = z.object({
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

export const certifyProductSchema = z.object({
  isCertified: z.boolean(),
});

export const moderateProductSchema = z.object({
  status: z.nativeEnum(ProductStatus, { message: 'Status produk tidak valid' }),
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
export const resolveDisputeSchema = z.object({
  resolution: z.enum(['RELEASE', 'REFUND'], { message: 'Resolusi hanya bisa RELEASE atau REFUND' }),
  note: z.string().min(5, 'Catatan resolusi wajib diisi minimal 5 karakter'),
});

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
