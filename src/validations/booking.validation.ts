import { z } from 'zod';

export const createBookingSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid.'),
  harvestLotId: z.string().uuid('ID lot panen tidak valid.').optional(),
  quantity: z.number().positive('Kuantitas harus lebih dari 0.'),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});

export const bookingIdParamSchema = z.object({
  id: z.string().uuid('ID booking tidak valid.'),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const checkoutBookingSchema = z.object({
  shippingAddress: z.string().min(5).max(500).optional(),
  shippingSnapshot: z
    .object({
      recipientName: z.string().optional(),
      phone: z.string().optional(),
      addressLine: z.string().optional(),
      province: z.string().optional(),
      regency: z.string().optional(),
      district: z.string().optional(),
      village: z.string().optional(),
      postalCode: z.string().optional(),
      rajaongkirDestinationId: z.number().int().positive().optional(),
      rajaongkirDestinationLabel: z.string().optional(),
    })
    .optional(),
  shippingSelections: z
    .array(
      z.object({
        sellerId: z.string().uuid(),
        courierCode: z.string().min(2),
        serviceCode: z.string().min(1),
        weight: z.number().positive(),
        weightUnit: z.enum(['KG', 'TON']).default('KG'),
        originDestinationId: z.number().int().positive(),
        destinationDestinationId: z.number().int().positive(),
        originLabel: z.string().optional(),
        destinationLabel: z.string().optional(),
      }),
    )
    .optional(),
  notes: z.string().max(500).optional(),
  voucherCode: z.string().max(50).optional(),
});

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'FULFILLED']).optional(),
});
