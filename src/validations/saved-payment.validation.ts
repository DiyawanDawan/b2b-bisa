import { z } from 'zod';

export const savedPaymentIdParamSchema = z.object({
  id: z.string().uuid('ID metode pembayaran tidak valid'),
});
