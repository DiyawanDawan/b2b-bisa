import { z } from 'zod';
import { PostStatus } from '#prisma';

export const createArticleSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Judul minimal 5 karakter'),
    content: z.string().min(20, 'Konten minimal 20 karakter'),
    categoryId: z.string().uuid('Category ID tidak valid').optional(),
    imageUrl: z.string().url('Format URL gambar tidak valid').optional(),
    status: z.nativeEnum(PostStatus).optional().default(PostStatus.PUBLISHED),
  }),
});

export const updateArticleSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID artikel tidak valid'),
  }),
  body: z.object({
    title: z.string().min(5, 'Judul minimal 5 karakter').optional(),
    content: z.string().min(20, 'Konten minimal 20 karakter').optional(),
    categoryId: z.string().uuid('Category ID tidak valid').optional(),
    imageUrl: z.string().url('Format URL gambar tidak valid').optional(),
    status: z.nativeEnum(PostStatus).optional(),
  }),
});

export const getArticleSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID artikel tidak valid'),
  }),
});

export const listArticlesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.nativeEnum(PostStatus).optional(),
    search: z.string().optional(),
    categoryId: z.string().uuid().optional(),
  }),
});
