import { z } from 'zod';
import { ProductMode } from '#prisma';

export const createRfqSchema = z.object({
  title: z.string().min(5).max(200),
  productMode: z.nativeEnum(ProductMode),
  biomassaType: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive(),
  specifications: z.string().max(2000).optional(),
  deliveryDate: z.string().datetime().optional(),
  budgetMax: z.coerce.number().positive().optional(),
});

export const respondRfqSchema = z.object({
  message: z.string().max(1000).optional(),
});

export const rfqIdParamSchema = z.object({
  id: z.string().uuid(),
});
