import { z } from 'zod';

export const updateStoreBannerSchema = z.object({
  params: z.object({
    bannerId: z.string().uuid('Invalid banner ID'),
  }),
  body: z.object({
    title: z.string().max(120).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.coerce.boolean().optional(),
  }),
});

export const bannerIdParamSchema = z.object({
  params: z.object({
    bannerId: z.string().uuid('Invalid banner ID'),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID'),
  }),
});
