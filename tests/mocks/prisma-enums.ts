/** Lightweight Prisma enum stubs for Jest (avoids loading generated client with import.meta). */

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

export const TransactionStatus = {
  PENDING: 'PENDING',
  ESCROW_HELD: 'ESCROW_HELD',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;

export const OrderStatus = {
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED',
} as const;

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
} as const;

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

export const NotificationType = {
  DISPUTE: 'DISPUTE',
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
} as const;
