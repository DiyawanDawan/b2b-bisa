import { z } from 'zod';

export const createPostSchema = z.object({
  title: z
    .string()
    .min(5, 'Judul diskusi minimal 5 karakter')
    .max(150, 'Judul diskusi maksimal 150 karakter'),
  content: z.string().min(10, 'Konten diskusi minimal 10 karakter'),
  categoryId: z.string().uuid('Kategori ID tidak valid').optional(),
});

export const createCommentSchema = z.object({
  postId: z.string().uuid('Post ID tidak valid'),
  content: z.string().min(3, 'Komentar minimal 3 karakter').max(1000, 'Komentar terlalu panjang'),
});

export const voteSchema = z.object({
  targetId: z.string().uuid('Target ID tidak valid'),
  targetType: z.enum(['POST', 'COMMENT'], {
    required_error: 'Tipe target harus POST atau COMMENT',
  }),
  voteType: z.enum(['UP', 'DOWN'], { required_error: 'Tipe vote harus UP atau DOWN' }),
});

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20)),
  categoryId: z.string().uuid('Kategori ID tidak valid').optional(),
  keyword: z.string().optional(),
});
