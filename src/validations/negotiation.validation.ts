import { z } from 'zod';
import { ProductMode } from '#prisma';

/** URL absolut atau path storage R2 (mis. negotiations/userId/file.pdf). */
const attachmentUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      const trimmed = value.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        try {
          // eslint-disable-next-line no-new
          new URL(trimmed);
          return true;
        } catch {
          return false;
        }
      }
      // Path relatif hasil upload media (bukan URL penuh).
      return /^[a-z0-9][a-z0-9/_ .-]*\.[a-z0-9]+$/i.test(trimmed);
    },
    { message: 'Format URL/path lampiran tidak valid' },
  )
  .optional();

export const createNegotiationSchema = z.object({
  productId: z.string().uuid('Product ID harus berupa UUID yang valid'),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0'),
  pricePerUnit: z.coerce.number().positive('Harga unit penawaran harus valid'),
  purpose: z.enum(['inquiry', 'negotiation']).optional(),
  message: z.string().max(1000).optional(),
  attachmentUrl: attachmentUrlSchema,
});

export const updateNegotiationStatusSchema = z
  .object({
    status: z.enum(['OFFER_ACCEPTED', 'OFFER_REJECTED'], {
      errorMap: () => ({ message: 'Status hanya bisa diisi OFFER_ACCEPTED atau OFFER_REJECTED' }),
    }),
    quantity: z.coerce.number().positive().optional(),
    pricePerUnit: z.coerce.number().positive().optional(),
    specifications: z.string().max(2000).optional(),
    taxStatus: z.enum(['INCLUDED', 'EXCLUDED']).optional(),
    rejectionReason: z.string().min(5, 'Alasan penolakan minimal 5 karakter').max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'OFFER_REJECTED' && !data.rejectionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alasan penolakan wajib diisi saat menolak tawaran.',
        path: ['rejectionReason'],
      });
    }
  });

export const cancelNegotiationSchema = z.object({
  cancellationReason: z
    .string()
    .min(5, 'Alasan pembatalan minimal 5 karakter')
    .max(500, 'Alasan pembatalan maksimal 500 karakter'),
});

export const counterOfferSchema = z.object({
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0'),
  pricePerUnit: z.coerce.number().positive('Harga unit harus lebih dari 0'),
});

export const chatMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Pesan tidak boleh kosong')
    .max(1000, 'Pesan terlalu panjang (maks 1000 karakter)'),
  attachmentUrl: attachmentUrlSchema,
});

export const editChatMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Pesan tidak boleh kosong')
    .max(1000, 'Pesan terlalu panjang (maks 1000 karakter)'),
});

export const listNegotiationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.string().optional(),
    keyword: z.string().optional(),
    productMode: z.nativeEnum(ProductMode).optional(),
    roomType: z.enum(['inquiry', 'negotiation']).optional(),
  }),
});
