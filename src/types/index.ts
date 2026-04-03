import { Request } from 'express';
import {
  UserRole,
  UserTier,
  VerificationStatus,
  UserStatus,
  ProductStatus,
  TokenType,
  BiomassaType,
  BiocharGrade,
  OrderStatus,
  TransactionStatus,
  PaymentMethod,
  TransactionType,
  PayoutStatus,
  NotificationType,
  NotificationPriority,
  DevicePlatform,
  DeviceStatus,
  PostStatus,
  UnitStatus,
  NegotiationStatus,
  PaymentStatus,
} from '#prisma';

// ── Re-export semua enum Prisma sebagai single source of truth ────────────────
export {
  UserRole,
  UserTier,
  VerificationStatus,
  UserStatus,
  ProductStatus,
  TokenType,
  BiomassaType,
  BiocharGrade,
  OrderStatus,
  TransactionStatus,
  PaymentMethod,
  TransactionType,
  PayoutStatus,
  NotificationType,
  NotificationPriority,
  DevicePlatform,
  DeviceStatus,
  PostStatus,
  UnitStatus,
  NegotiationStatus,
  PaymentStatus,
};

// ── Auth & User Interfaces ────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  tier: UserTier;
  subscriptionExpiresAt: Date | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface UserResponse {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  province?: string | null;
  regency?: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ── Product Interfaces ────────────────────────────────────────────────────────
// Aligned to schema.prisma model Product (field names match exactly)

export interface ProductResponse {
  id: string;
  userId: string;
  categoryId?: string | null;
  name: string;
  biomassaType: BiomassaType;
  grade?: BiocharGrade | null;
  description?: string | null;
  pricePerUnit: number;
  stock: number;
  unit: UnitStatus;
  minOrder: number;
  province?: string | null;
  regency?: string | null;
  thumbnailUrl?: string | null;
  isCertified: boolean;
  status: ProductStatus;
  isIotMonitored: boolean;
  isEscrowProtected: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Tech Specs
  technicalSpec?: {
    moistureContent?: number | null;
    carbonPurity?: number | null;
    productionCapacity?: number | null;
    surfaceArea?: number | null;
    phLevel?: number | null;
    density?: string | null;
    carbonOffsetPerTon?: number | null;
    grossWeightPerSak?: number | null;
    netWeightPerSak?: number | null;
    bagDimension?: string | null;
  } | null;
  // Relationships
  images?: {
    url: string;
    isPrimary: boolean;
    order: number;
  }[];
}

// ── Order Interfaces ──────────────────────────────────────────────────────────
// Aligned to schema.prisma model Order (field names match exactly)

export interface OrderResponse {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  subtotal: number;
  platformFee: number;
  logisticsFee: number;
  vatAmount: number;
  totalAmount: number;
  totalQuantity: number;
  creditsApplied: number;
  isInsured: boolean;
  isDigitalSigned: boolean;
  shippingAddressId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── AI Prediction Interfaces ──────────────────────────────────────────────────
// Aligned to schema.prisma model AIPrediction (field names match exactly)

export interface AIPredictionResponse {
  id: string;
  userId: string;
  biomassaType: BiomassaType;
  suhuPirolisis?: number | null;
  waktuPembakaran?: number | null;
  beratInput?: number | null;
  predictedGrade?: BiocharGrade | null;
  predictedYield?: number | null;
  cOrganik?: number | null;
  dosis?: number | null;
  createdAt: Date;
}

// ── IoT Device Interfaces ─────────────────────────────────────────────────────
// Aligned to schema.prisma model IotDevice (field names match exactly)

export interface IoTDeviceResponse {
  id: string;
  userId: string;
  deviceId: string;
  name?: string | null;
  status: DeviceStatus;
  lat?: number | null;
  lng?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── GIS / Waste Data Interfaces ───────────────────────────────────────────────
// Aligned to schema.prisma model WasteData (field names match exactly)

export interface WasteDataResponse {
  id: string;
  province: string;
  regency?: string | null;
  biomassaType: BiomassaType;
  volumeTon: number;
  year: number;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
}
