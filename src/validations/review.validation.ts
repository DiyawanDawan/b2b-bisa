import { z } from 'zod';

export const createReviewSchema = z.object({
  orderId: z.string().uuid('Order ID harus berupa UUID yang valid'),
  rating: z.coerce.number().min(1, 'Rating minimal 1 bintang').max(5, 'Rating maksimal 5 bintang'),
  // comment adalah Optional di schema Prisma (String?), tapi disarankan diisi minimal 10 karakter
  comment: z.string().min(10, 'Berikan ulasan singkat (minimal 10 karakter)').optional(),
});

export const updateReviewSchema = createReviewSchema.partial({
  orderId: true,
});

export const replyReviewSchema = z.object({
  reply: z
    .string()
    .min(5, 'Balasan minimal 5 karakter')
    .max(1000, 'Balasan maksimal 1000 karakter'),
});

export const getProductReviewsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  hasMedia: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
});
