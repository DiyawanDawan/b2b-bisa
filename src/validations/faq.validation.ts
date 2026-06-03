import { z } from 'zod';

export const createFaqSchema = z.object({
  body: z.object({
    question: z.string().min(5, 'Pertanyaan minimal 5 karakter'),
    answer: z.string().min(10, 'Jawaban minimal 10 karakter'),
    order: z.coerce.number().int().min(0).optional().default(0),
    isActive: z.boolean().optional().default(true),
  }),
});

export const updateFaqSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID FAQ tidak valid'),
  }),
  body: z.object({
    question: z.string().min(5).optional(),
    answer: z.string().min(10).optional(),
    order: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const getFaqSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID FAQ tidak valid'),
  }),
});

export const listFaqsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    includeInactive: z.enum(['true', 'false']).optional(),
  }),
});
