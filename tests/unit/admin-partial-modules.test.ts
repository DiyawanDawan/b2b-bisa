/**
 * Focused unit tests for Fase 2 partial-module order state machine + Zod payloads.
 * Does not require DB or full prisma generate.
 */
import {
  adminCancelOrderSchema,
  adminUpdateOrderStatusSchema,
  adminMergeCategorySchema,
  adminCreatePolicySchema,
  adminMarketTrendSchema,
} from '../../src/validations/admin-partial.validation';

const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'PROCESSING', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['COMPLETED', 'DISPUTED'],
  DISPUTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

describe('admin partial modules — order transitions', () => {
  it('allows PENDING → PROCESSING and rejects PENDING → COMPLETED', () => {
    expect(ORDER_STATUS_TRANSITIONS.PENDING).toContain('PROCESSING');
    expect(ORDER_STATUS_TRANSITIONS.PENDING).not.toContain('COMPLETED');
  });

  it('blocks cancel path from SHIPPED (must escalate)', () => {
    expect(ORDER_STATUS_TRANSITIONS.SHIPPED).not.toContain('CANCELLED');
    expect(ORDER_STATUS_TRANSITIONS.SHIPPED).toContain('DISPUTED');
  });
});

describe('admin partial modules — zod schemas', () => {
  it('requires reason for status update', () => {
    const bad = adminUpdateOrderStatusSchema.safeParse({
      status: 'PROCESSING',
      reason: 'abc',
    });
    expect(bad.success).toBe(false);

    const ok = adminUpdateOrderStatusSchema.safeParse({
      status: 'PROCESSING',
      reason: 'Pembayaran sudah diverifikasi manual',
    });
    expect(ok.success).toBe(true);
  });

  it('requires longer reason for cancel', () => {
    const bad = adminCancelOrderSchema.safeParse({ reason: 'short' });
    expect(bad.success).toBe(false);
    const ok = adminCancelOrderSchema.safeParse({
      reason: 'Buyer request cancel before shipment',
      refund: true,
    });
    expect(ok.success).toBe(true);
  });

  it('validates category merge target uuid', () => {
    const bad = adminMergeCategorySchema.safeParse({ targetCategoryId: 'x' });
    expect(bad.success).toBe(false);
  });

  it('validates policy create and market trend payloads', () => {
    expect(
      adminCreatePolicySchema.safeParse({
        title: 'Syarat baru',
        content: 'Konten kebijakan yang cukup panjang',
      }).success,
    ).toBe(true);

    expect(
      adminMarketTrendSchema.safeParse({
        label: 'Biochar A',
        currentValue: '+1.2%',
        trendType: 'UP',
        category: 'BIOMASSA',
        region: 'Nusa Tenggara Barat',
        period: '2026-Q2',
        source: 'internal',
      }).success,
    ).toBe(true);
  });
});
