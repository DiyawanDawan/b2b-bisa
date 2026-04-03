import { z } from 'zod';

export const createReviewSchema = z.object({
  orderId: z.string().uuid('Order ID harus berupa UUID yang valid'),
  rating: z.coerce.number().min(1, 'Rating minimal 1 bintang').max(5, 'Rating maksimal 5 bintang'),
  // comment adalah Optional di schema Prisma (String?), tapi disarankan diisi minimal 10 karakter
  comment: z.string().min(10, 'Berikan ulasan singkat (minimal 10 karakter)').optional(),
});
