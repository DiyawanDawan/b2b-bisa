import { z } from 'zod';

export const askProductQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(10, 'Pertanyaan minimal 10 karakter')
    .max(1000, 'Pertanyaan maksimal 1000 karakter'),
});

export const answerProductQuestionSchema = z.object({
  answer: z
    .string()
    .trim()
    .min(5, 'Jawaban minimal 5 karakter')
    .max(2000, 'Jawaban maksimal 2000 karakter'),
});

export const listProductQuestionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  }),
});
