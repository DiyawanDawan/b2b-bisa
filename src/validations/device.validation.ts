import { z } from 'zod';
import { BiomassaType, DeviceStatus, PaymentMethod } from '#prisma';

export const adminCreateIotDeviceSchema = z.object({
  body: z.object({
    serialNumber: z.string().trim().min(3, 'Serial number minimal 3 karakter'),
    name: z.string().trim().min(1, 'Nama tidak boleh kosong').optional(),
  }),
});

export const claimIotDeviceSchema = z.object({
  body: z.object({
    deviceSecret: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/, 'deviceSecret harus berupa 64 karakter hex'),
    name: z.string().trim().min(1, 'Nama tidak boleh kosong').optional(),
  }),
});

export const logReadingSchema = z.object({
  body: z.object({
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
      status: z.nativeEnum(DeviceStatus).optional(),
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
    search: z.string().optional(),
    status: z.string().optional(),
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

export const iotDashboardQuerySchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid Device UUID format'),
  }),
  query: z.object({
    range: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h'),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    metrics: z.string().optional(),
  }),
});

export const iotFleetQuerySchema = z.object({
  query: z.object({
    range: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h'),
  }),
});

export const iotDeviceAlertsQuerySchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid Device UUID format'),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    isRead: z.enum(['true', 'false']).optional(),
  }),
});

export const iotDeviceIdParamsSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid Device UUID format'),
  }),
});

export const iotPyrolysisSessionStartSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid Device UUID format'),
  }),
  body: z.object({
    biomassaType: z.nativeEnum(BiomassaType).default(BiomassaType.SEKAM_PADI),
    beratInput: z.number().positive().max(10_000).default(1000),
  }),
});

export const iotAnalyzeRealtimeSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid('Invalid Device UUID format'),
  }),
  body: z
    .object({
      biomassaType: z.nativeEnum(BiomassaType).optional(),
      beratInput: z.number().positive().max(10_000).optional(),
      waktuPembakaranMin: z
        .number()
        .int()
        .min(1)
        .max(24 * 60)
        .optional(),
      windowMinutes: z.number().int().min(5).max(480).optional(),
      savePrediction: z.boolean().optional(),
    })
    .default({}),
});
