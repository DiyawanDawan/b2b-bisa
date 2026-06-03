import { z } from 'zod';

export const withdrawRequestSchema = z.object({
  amount: z.coerce.number().positive('Jumlah pencairan harus lebih dari 0'),
});

export const createPayoutAccountSchema = z.object({
  bankId: z.string().uuid('Bank ID harus berupa UUID yang valid'),
  accountNumber: z.string().min(5, 'Nomor rekening terlalu pendek').max(30),
  accountName: z.string().min(3, 'Nama pemilik rekening wajib diisi').max(100),
  isMain: z.boolean().optional(),
});

/**
 * SEC-BE-010: validasi PATCH payout account (sebelumnya tidak ada Zod).
 * Gunakan dengan `validate(updatePayoutAccountSchema, 'all')`.
 */
export const updatePayoutAccountSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID rekening tidak valid'),
  }),
  body: z
    .object({
      bankId: z.string().uuid('Bank ID harus berupa UUID yang valid').optional(),
      accountNumber: z.string().min(5, 'Nomor rekening terlalu pendek').max(30).optional(),
      accountName: z.string().min(3, 'Nama pemilik rekening wajib diisi').max(100).optional(),
      isMain: z.boolean().optional(),
    })
    .strict()
    .refine((d) => Object.values(d).some((v) => v !== undefined), {
      message: 'Setidaknya satu field harus diupdate.',
    }),
});

/**
 * Reusable schema untuk validasi UUID `:id` param di payout account routes.
 * Gunakan dengan `validate(payoutAccountIdParamSchema, 'params')`.
 */
export const payoutAccountIdParamSchema = z.object({
  id: z.string().uuid('ID rekening tidak valid'),
});

export const getWalletHistorySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    type: z.string().optional(),
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});
