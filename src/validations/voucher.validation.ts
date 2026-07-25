import { z } from 'zod';
import { queryBoolean, queryLimit, queryPage } from '#validations/admin-query.validation';

export const validateVoucherSchema = z.object({
  code: z.string().min(2).max(50),
  subtotal: z.coerce.number().positive(),
  sellerIds: z.array(z.string().uuid()).optional(),
});

export const listVouchersAdminSchema = z.object({
  page: queryPage,
  limit: queryLimit(100, 10),
  search: z.string().optional(),
  isActive: queryBoolean,
  /** active_now | upcoming | expired — omit for all periods */
  period: z.enum(['active_now', 'upcoming', 'expired']).optional(),
});

export const createVoucherAdminSchema = z
  .object({
    code: z.string().min(2).max(50),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.coerce.number().positive(),
    minOrderAmount: z.coerce.number().nonnegative().default(0),
    maxDiscount: z.coerce.number().positive().optional().nullable(),
    scope: z.enum(['PLATFORM', 'SUPPLIER']).default('PLATFORM'),
    supplierId: z.string().uuid().optional().nullable(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    usagePerUser: z.coerce.number().int().positive().default(1),
    startsAt: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.scope === 'SUPPLIER' && !data.supplierId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'supplierId wajib untuk voucher SUPPLIER',
        path: ['supplierId'],
      });
    }
    if (data.type === 'PERCENT' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Persentase diskon maksimal 100',
        path: ['value'],
      });
    }
    if (data.startsAt && data.expiresAt && data.startsAt > data.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tanggal mulai tidak boleh setelah tanggal berakhir',
        path: ['expiresAt'],
      });
    }
  });

export const updateVoucherAdminSchema = z
  .object({
    type: z.enum(['PERCENT', 'FIXED']).optional(),
    value: z.coerce.number().positive().optional(),
    minOrderAmount: z.coerce.number().nonnegative().optional(),
    maxDiscount: z.coerce.number().positive().optional().nullable(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    usagePerUser: z.coerce.number().int().positive().optional(),
    startsAt: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().optional(),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((data) => Object.keys(data).some((k) => k !== 'reason'), {
    message: 'Minimal satu field harus diperbarui',
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT' && data.value != null && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Persentase diskon maksimal 100',
        path: ['value'],
      });
    }
    if (data.startsAt && data.expiresAt && data.startsAt > data.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tanggal mulai tidak boleh setelah tanggal berakhir',
        path: ['expiresAt'],
      });
    }
  });

export const voucherIdParamSchema = z.object({
  id: z.string().uuid('ID voucher tidak valid'),
});
