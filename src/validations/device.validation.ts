import { z } from 'zod';
import { PaymentMethod } from '#prisma';

export const registerDeviceSchema = z.object({
  body: z.object({
    deviceId: z.string().min(3, 'Device ID minimal 3 karakter'),
    name: z.string().optional(),
  }),
});

export const logReadingSchema = z.object({
  body: z.object({
    deviceId: z.string(),
    temp: z.number(),
    hum: z.number().optional(),
    co2: z.number().optional(),
  }),
});

export const updateDeviceSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid Device UUID format'),
  }),
  body: z
    .object({
      name: z.string().min(1, 'Nama tidak boleh kosong').optional(),
      thresholdMin: z.number().nonnegative().optional(),
      thresholdMax: z.number().nonnegative().optional(),
    })
    .refine(
      (value) =>
        value.thresholdMin === undefined ||
        value.thresholdMax === undefined ||
        value.thresholdMax >= value.thresholdMin,
      {
        message: 'thresholdMax harus lebih besar atau sama dengan thresholdMin',
        path: ['thresholdMax'],
      },
    ),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 20)),
  }),
});

export const subscriptionSchema = z.object({
  body: z.object({
    channel_code: z.string({ required_error: 'Channel code diperlukan' }),
    method: z.nativeEnum(PaymentMethod, {
      required_error: 'Payment method diperlukan',
    }),
  }),
});
