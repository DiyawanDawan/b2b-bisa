import { z } from 'zod';

export const listKnowledgeSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createKnowledgeTextSchema = z.object({
  title: z.string().trim().min(3).max(255),
  content: z.string().trim().min(20).max(200_000),
  description: z.string().trim().max(2000).optional(),
});

export const uploadKnowledgeSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional(),
});
