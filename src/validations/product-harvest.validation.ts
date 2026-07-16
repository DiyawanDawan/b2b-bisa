import { z } from 'zod';

export const productIdParamSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid.'),
});

export const lotIdParamSchema = z.object({
  lotId: z.string().uuid('ID batch panen tidak valid.'),
});

export const createHarvestLotSchema = z.object({
  seasonLabel: z.string().max(80).optional(),
  expectedHarvestDate: z.coerce.date(),
  expectedQuantityTon: z.coerce.number().positive('Estimasi ton harus lebih dari 0.'),
  notes: z.string().max(1000).optional(),
});

export const updateHarvestLotSchema = z.object({
  seasonLabel: z.string().max(80).optional(),
  expectedHarvestDate: z.coerce.date().optional(),
  expectedQuantityTon: z.coerce.number().positive().optional(),
  notes: z.string().max(1000).optional(),
});

export const confirmHarvestLotSchema = z.object({
  actualHarvestDate: z.coerce.date().optional(),
  actualQuantityTon: z.coerce.number().positive('Hasil panen aktual harus lebih dari 0.'),
});

export const cancelHarvestLotSchema = z.object({
  notes: z.string().max(1000).optional(),
});

