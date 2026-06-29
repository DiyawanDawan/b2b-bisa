import { z } from 'zod';

export const validateVoucherSchema = z.object({
  code: z.string().min(2).max(50),
  subtotal: z.coerce.number().positive(),
  sellerIds: z.array(z.string().uuid()).optional(),
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
  });

export const updateVoucherAdminSchema = z.object({
  isActive: z.boolean().optional(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const voucherIdParamSchema = z.object({
  id: z.string().uuid('ID voucher tidak valid'),
});
