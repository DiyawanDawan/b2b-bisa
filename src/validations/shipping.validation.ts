import { z } from 'zod';

export const searchDestinationSchema = z.object({
  search: z.string().min(2, 'Minimal 2 karakter untuk pencarian lokasi'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const calculateDomesticCostSchema = z.object({
  originId: z.coerce.number().int().positive('ID asal wajib'),
  destinationId: z.coerce.number().int().positive('ID tujuan wajib'),
  weight: z.coerce.number().positive('Berat wajib'),
  weightUnit: z.enum(['KG', 'TON']).default('KG'),
  courier: z.string().min(2).optional(),
  price: z.enum(['lowest', 'highest']).optional(),
  originLabel: z.string().max(500).optional(),
  destinationLabel: z.string().max(500).optional(),
  /** Untuk merge BISA Express: jarak dari Alamat Profil */
  sellerId: z.string().uuid().optional(),
  buyerId: z.string().uuid().optional(),
});

export const trackWaybillSchema = z.object({
  awb: z.string().min(5, 'Nomor resi tidak valid'),
  courier: z.string().min(2, 'Kode kurir wajib'),
  lastPhoneNumber: z
    .string()
    .regex(/^\d{5}$/, '5 digit terakhir nomor penerima (untuk JNE dll.)')
    .optional(),
  orderId: z.string().uuid('Order ID harus UUID').optional(),
});

export const setShippingOriginSchema = z.object({
  originId: z.coerce.number().int().positive(),
  originLabel: z.string().max(500).optional(),
});

export const requestPickupSchema = z.object({
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format pickupDate harus YYYY-MM-DD'),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format pickupTime harus HH:MM'),
  pickupVehicle: z.enum(['Motor', 'Mobil', 'Truk']),
  orders: z
    .array(
      z.object({
        orderNo: z.string().min(5, 'orderNo wajib diisi'),
      }),
    )
    .min(1, 'Minimal satu orderNo wajib dipilih'),
});

export const pickupVehicleOptionSchema = z.object({
  code: z.enum(['Motor', 'Mobil', 'Truk']),
  label: z.string().min(1).max(120),
  minTotalWeight: z.coerce.number().min(0).max(100000),
  maxPerOrderWeight: z.coerce.number().min(0).max(100000).optional(),
  weightUnit: z.enum(['KG', 'TON']).default('KG'),
  notes: z.string().max(500).optional().default(''),
});

export const setPickupVehicleOptionsSchema = z.object({
  options: z.array(pickupVehicleOptionSchema).min(1),
});

export const setActiveCouriersSchema = z.object({
  couriers: z
    .array(z.string().min(2).max(40))
    .min(1, 'Minimal 1 ekspedisi aktif')
    .max(50, 'Maksimal 50 ekspedisi'),
});

/** Dipakai saat checkout — disimpan di snapshot order */
export const shippingSelectionSchema = z.object({
  originId: z.coerce.number().int().positive(),
  destinationId: z.coerce.number().int().positive(),
  destinationLabel: z.string().optional(),
  weight: z.coerce.number().positive(),
  weightUnit: z.enum(['KG', 'TON']).default('KG'),
  courierCode: z.string().min(2),
  serviceCode: z.string().optional(),
  serviceName: z.string().optional(),
  cost: z.coerce.number().nonnegative(),
  etd: z.string().optional(),
});
