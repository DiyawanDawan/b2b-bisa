import { z } from 'zod';

export const toggleLikeSchema = z.object({
  productId: z.string().uuid('Product ID tidak valid'),
});
