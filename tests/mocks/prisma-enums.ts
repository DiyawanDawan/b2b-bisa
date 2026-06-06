/** Lightweight Prisma enum stubs for Jest (avoids loading generated client with import.meta). */

export class Decimal {
  constructor(public readonly value: number | string) {}
  toString() {
    return String(this.value);
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

export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];
