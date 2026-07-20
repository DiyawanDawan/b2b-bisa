import { z } from 'zod';
import {
  BisaExpressStatus,
  DeliveryAttemptResult,
  DriverStatus,
  DriverVehicleType,
  HubType,
  UnitStatus,
} from '#prisma';
import { BISA_EXPRESS_SERVICE_TYPES } from '#constants/bisa-express.constants';

export const checkCoverageSchema = z.object({
  sellerId: z.string().uuid().optional(),
  buyerId: z.string().uuid().optional(),
  originZone: z.string().min(2).optional(),
  destinationZone: z.string().min(2).optional(),
});

export const calculateSchema = z.object({
  /** Qty produk dalam UnitStatus (KG/TON) — bukan gram */
  weight: z.coerce.number().positive(),
  weightUnit: z.nativeEnum(UnitStatus).default(UnitStatus.KG),
  serviceType: z.enum(BISA_EXPRESS_SERVICE_TYPES).optional(),
  itemValue: z.coerce.number().nonnegative().optional(),
  /** Wajib: zona dari GIS Alamat Profil (bukan keyword manual) */
  sellerId: z.string().uuid(),
  buyerId: z.string().uuid(),
});

export const trackAwbParamsSchema = z.object({
  awb: z.string().min(8),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid(),
});

export const shipmentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const shipmentIdAltParamsSchema = z.object({
  shipmentId: z.string().uuid(),
});

export const requestPickupSchema = z.object({
  orderId: z.string().uuid(),
  pickupScheduledAt: z.coerce.date().optional(),
  sellerNote: z.string().max(2000).optional(),
});

export const sellerNoteSchema = z.object({
  sellerNote: z.string().min(1).max(2000),
});

export const driverAcceptSchema = z.object({});

export const driverPickupSchema = z.object({
  photoUrl: z.string().url().optional(),
  note: z.string().max(1000).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

export const driverHubSchema = z.object({
  hubId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

export const driverDeliverSchema = z.object({
  podPhotoUrl: z.string().url(),
  podSignatureUrl: z.string().url(),
  podReceivedBy: z.string().min(2).max(120),
  podNote: z.string().max(1000).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

export const driverFailSchema = z.object({
  result: z.nativeEnum(DeliveryAttemptResult),
  note: z.string().max(1000).optional(),
  photoUrl: z.string().url().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

export const driverLocationSchema = z.object({
  points: z
    .array(
      z.object({
        latitude: z.coerce.number(),
        longitude: z.coerce.number(),
        speed: z.coerce.number().optional(),
        heading: z.coerce.number().optional(),
        accuracy: z.coerce.number().optional(),
        capturedAt: z.coerce.date().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const driverStatusSchema = z.object({
  status: z.nativeEnum(DriverStatus),
});

export const adminCreateDriverSchema = z.object({
  userId: z.string().uuid(),
  employeeCode: z.string().min(3).max(40),
  vehicleType: z.nativeEnum(DriverVehicleType).optional(),
  vehiclePlate: z.string().max(20).optional(),
  maxCapacityKg: z.coerce.number().positive().optional(),
  homeHubId: z.string().uuid().optional(),
});

export const adminUpdateDriverSchema = z.object({
  vehicleType: z.nativeEnum(DriverVehicleType).optional(),
  vehiclePlate: z.string().max(20).optional(),
  maxCapacityKg: z.coerce.number().positive().optional(),
  homeHubId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  status: z.nativeEnum(DriverStatus).optional(),
});

export const adminCreateHubSchema = z.object({
  code: z.string().min(3).max(40),
  name: z.string().min(3).max(120),
  type: z.nativeEnum(HubType).optional(),
  addressId: z.string().uuid(),
  coverageProvinces: z.array(z.string()).optional(),
  coverageRegencies: z.array(z.string()).optional(),
  contactPhone: z.string().max(30).optional(),
  contactName: z.string().max(120).optional(),
  operatingHours: z.string().max(60).optional(),
  maxDailyCapacity: z.coerce.number().int().positive().optional(),
});

export const adminUpdateHubSchema = adminCreateHubSchema.partial().omit({ code: true });

export const adminCreateRateSchema = z.object({
  originZone: z.string().min(2).max(60),
  destinationZone: z.string().min(2).max(60),
  serviceType: z.enum(BISA_EXPRESS_SERVICE_TYPES),
  minWeight: z.coerce.number().min(0).default(0),
  maxWeight: z.coerce.number().positive().default(999_999),
  baseCost: z.coerce.number().nonnegative(),
  perUnitCost: z.coerce.number().nonnegative(),
  weightUnit: z.nativeEnum(UnitStatus).default(UnitStatus.KG),
  etdDays: z.coerce.number().int().min(0).max(30),
});

export const adminUpdateRateSchema = adminCreateRateSchema.partial();

export const adminUpsertServiceRuleSchema = z.object({
  serviceType: z.enum(BISA_EXPRESS_SERVICE_TYPES),
  label: z.string().min(2).max(80).optional().nullable(),
  minWeight: z.coerce.number().min(0),
  maxWeight: z.coerce.number().positive(),
  weightUnit: z.nativeEnum(UnitStatus).default(UnitStatus.KG),
  alwaysAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  note: z.string().max(500).optional().nullable(),
});

export const adminUpdateServiceRuleSchema = adminUpsertServiceRuleSchema.partial();

export const adminCreateCoverageSchema = z.object({
  provinceId: z.string().min(2).max(80),
  regencyId: z.string().min(2).max(80).optional().nullable(),
  zone: z.string().min(2).max(60),
  isPickup: z.boolean().optional(),
  isDelivery: z.boolean().optional(),
});

export const adminAssignSchema = z.object({
  pickupDriverId: z.string().uuid().optional(),
  deliveryDriverId: z.string().uuid().optional(),
});

export const adminOverrideStatusSchema = z.object({
  status: z.nativeEnum(BisaExpressStatus),
  description: z.string().min(3).max(500).optional(),
});

export const listShipmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(BisaExpressStatus).optional(),
  search: z.string().max(100).optional(),
});
