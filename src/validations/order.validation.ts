import { z } from 'zod';

export const createContractSchema = z.object({
  negotiationId: z.string().uuid('Negotiation ID harus berupa UUID yang valid'),
  shippingAddress: z.string().min(10, 'Alamat pengiriman harus lengkap (minimal 10 karakter)'),
});

export const updateTrackingSchema = z.object({
  vesselName: z.string().min(3, 'Nama Kapal/Kendaraan ekspedisi harus jelas'),
  originHub: z.string().optional(),
  destinationHub: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

export const initializePaymentSchema = z.object({
  channelCode: z.string().max(20, 'Kode channel terlalu panjang').optional(),
});

export const raiseDisputeSchema = z.object({
  reason: z.string().min(10, 'Alasan sengketa harus jelas (minimal 10 karakter)'),
});
