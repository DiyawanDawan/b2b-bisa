import { z } from 'zod';
import { TrendCategory } from '#prisma';

export const getTrendsSchema = z.object({
  category: z
    .nativeEnum(TrendCategory, {
      errorMap: () => ({ message: 'Kategori harus berupa CARBON, LOGISTICS, atau BIOMASSA' }),
    })
    .optional(),
});

export const getPredictionSchema = z.object({
  id: z.string().uuid('ID prediksi tidak valid (harus berupa UUID)'),
});
