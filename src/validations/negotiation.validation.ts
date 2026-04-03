import { z } from 'zod';

export const createNegotiationSchema = z.object({
  productId: z.string().uuid('Product ID harus berupa UUID yang valid'),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0'),
  pricePerUnit: z.coerce.number().positive('Harga unit penawaran harus valid'),
});

export const updateNegotiationStatusSchema = z.object({
  status: z.enum(['OFFER_ACCEPTED', 'OFFER_REJECTED'], {
    errorMap: () => ({ message: 'Status hanya bisa diisi OFFER_ACCEPTED atau OFFER_REJECTED' }),
  }),
  quantity: z.coerce.number().positive().optional(),
  pricePerUnit: z.coerce.number().positive().optional(),
  specifications: z.string().max(2000).optional(),
  taxStatus: z.enum(['INCLUDED', 'EXCLUDED']).optional(),
});

export const chatMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Pesan tidak boleh kosong')
    .max(1000, 'Pesan terlalu panjang (maks 1000 karakter)'),
  attachmentUrl: z.string().url('Format URL lampiran tidak valid').optional(),
});
