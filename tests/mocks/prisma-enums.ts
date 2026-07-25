/** Lightweight Prisma enum stubs for Jest (avoids loading generated client with import.meta). */

/**
 * Stub constructor so modules that statically import `PrismaClient` from
 * `#prisma` (e.g. `src/config/prisma.ts`) can be linked under Jest's ESM
 * runtime. Tests replace the client itself via `jest.mock('#config/prisma')`.
 */
export class PrismaClient {
  $connect() {
    return Promise.resolve();
  }

  $disconnect() {
    return Promise.resolve();
  }

  $extends() {
    return this;
  }

  $on() {}
}

export class Decimal {
  constructor(public readonly value: number | string) {}

  private n() {
    return Number(this.value);
  }

  toNumber() {
    return this.n();
  }

  toString() {
    return String(this.value);
  }

  lte(other: Decimal | number) {
    const o = other instanceof Decimal ? other.n() : Number(other);
    return this.n() <= o;
  }

  lt(other: Decimal | number) {
    const o = other instanceof Decimal ? other.n() : Number(other);
    return this.n() < o;
  }

  valueOf() {
    return this.n();
  }

  mul(other: Decimal | number) {
    const o = other instanceof Decimal ? other.n() : Number(other);
    return new Decimal(this.n() * o);
  }

  div(other: Decimal | number) {
    const o = other instanceof Decimal ? other.n() : Number(other);
    return new Decimal(this.n() / o);
  }

  add(other: Decimal | number) {
    const o = other instanceof Decimal ? other.n() : Number(other);
    return new Decimal(this.n() + o);
  }

  static min(a: Decimal, b: Decimal) {
    return a.n() <= b.n() ? a : b;
  }
}

export const Prisma = { Decimal };

export const VerificationStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;

export const ProductCertificateStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ProductCertificateStatus =
  (typeof ProductCertificateStatus)[keyof typeof ProductCertificateStatus];

export const TransactionStatus = {
  PENDING: 'PENDING',
  ESCROW_HELD: 'ESCROW_HELD',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;

export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;

export const NegotiationStatus = {
  LOCKED: 'LOCKED',
  OPEN_NEGOTIATION: 'OPEN_NEGOTIATION',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
} as const;

export const NegotiationRoomType = {
  NEGOTIATION: 'NEGOTIATION',
} as const;

export const TaxStatus = {
  INCLUDED: 'INCLUDED',
} as const;

export const DisputeStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
} as const;

export const NotificationPriority = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
} as const;

export const MediaUploadSessionStatus = {
  COMPLETED: 'COMPLETED',
} as const;

export const ProductStatus = {
  ACTIVE: 'ACTIVE',
  DRAFT: 'DRAFT',
  INACTIVE: 'INACTIVE',
  BLOCKED: 'BLOCKED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  DELETED: 'DELETED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const TokenType = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  RESET_PASSWORD: 'RESET_PASSWORD',
  REFRESH: 'REFRESH',
} as const;

export const UserRole = {
  ADMIN: 'ADMIN',
  BUYER: 'BUYER',
  SUPPLIER: 'SUPPLIER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  INACTIVE: 'INACTIVE',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const UserTier = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const;
export type UserTier = (typeof UserTier)[keyof typeof UserTier];

export const BiomassaType = {
  BIOCHAR: 'BIOCHAR',
  SEKAM_PADI: 'SEKAM_PADI',
  TONGKOL_JAGUNG: 'TONGKOL_JAGUNG',
  TEMPURUNG_KELAPA: 'TEMPURUNG_KELAPA',
  WOOD_CHIP: 'WOOD_CHIP',
  OTHER: 'OTHER',
} as const;
export type BiomassaType = (typeof BiomassaType)[keyof typeof BiomassaType];

export const BiocharGrade = { A: 'A', B: 'B', C: 'C' } as const;
export type BiocharGrade = (typeof BiocharGrade)[keyof typeof BiocharGrade];
export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  E_WALLET: 'E_WALLET',
  QRIS: 'QRIS',
  CREDIT_CARD: 'CREDIT_CARD',
  CASH: 'CASH',
} as const;
export const TransactionType = {
  SALES: 'SALES',
  PAYOUT: 'PAYOUT',
  REFUND: 'REFUND',
  PLATFORM_FEE: 'PLATFORM_FEE',
  SUBSCRIPTION: 'SUBSCRIPTION',
  PROMOTION: 'PROMOTION',
} as const;
export const PayoutStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export const DevicePlatform = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
  WEB: 'WEB',
  IOT_HARDWARE: 'IOT_HARDWARE',
} as const;
export const DeviceStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];
export const PostStatus = {
  PUBLISHED: 'PUBLISHED',
  DRAFT: 'DRAFT',
  ARCHIVED: 'ARCHIVED',
} as const;
export const UnitStatus = { KG: 'KG', TON: 'TON' } as const;
export type UnitStatus = (typeof UnitStatus)[keyof typeof UnitStatus];

export const BisaExpressStatus = {
  AWAITING_PICKUP: 'AWAITING_PICKUP',
  PICKUP_ASSIGNED: 'PICKUP_ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT_TO_HUB: 'IN_TRANSIT_TO_HUB',
  AT_ORIGIN_HUB: 'AT_ORIGIN_HUB',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_DESTINATION_HUB: 'AT_DESTINATION_HUB',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;
export type BisaExpressStatus = (typeof BisaExpressStatus)[keyof typeof BisaExpressStatus];

export const TrendType = {
  UP: 'UP',
  DOWN: 'DOWN',
  STABLE: 'STABLE',
} as const;

export const TrendCategory = {
  CARBON: 'CARBON',
  LOGISTICS: 'LOGISTICS',
  BIOMASSA: 'BIOMASSA',
} as const;

export const HarvestLotStatus = {
  SCHEDULED: 'SCHEDULED',
  HARVESTING: 'HARVESTING',
  HARVESTED: 'HARVESTED',
  STOCKED: 'STOCKED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export const PartnershipStatus = {
  PENDING: 'PENDING',
  AWAITING_SIGNATURE: 'AWAITING_SIGNATURE',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  TERMINATED: 'TERMINATED',
  EXPIRED: 'EXPIRED',
  RENEWAL_PENDING: 'RENEWAL_PENDING',
} as const;

export const NotificationType = {
  DISPUTE: 'DISPUTE',
  PRODUCT_CERTIFICATE: 'PRODUCT_CERTIFICATE',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const VoucherScope = {
  PLATFORM: 'PLATFORM',
  SUPPLIER: 'SUPPLIER',
} as const;

export const VoucherType = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const;

export const ReferralRewardStatus = {
  PENDING: 'PENDING',
  CREDITED: 'CREDITED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReferralRewardStatus = (typeof ReferralRewardStatus)[keyof typeof ReferralRewardStatus];

export const RfqStatus = {
  OPEN: 'OPEN',
  MATCHED: 'MATCHED',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED',
} as const;
export type RfqStatus = (typeof RfqStatus)[keyof typeof RfqStatus];

export const BookingStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  FULFILLED: 'FULFILLED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const LiveSessionStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
} as const;
export type LiveSessionStatus = (typeof LiveSessionStatus)[keyof typeof LiveSessionStatus];

export const ProductMode = {
  BIOMASS_MATERIAL: 'BIOMASS_MATERIAL',
  ORGANIC_PRODUCE: 'ORGANIC_PRODUCE',
} as const;
export type ProductMode = (typeof ProductMode)[keyof typeof ProductMode];
