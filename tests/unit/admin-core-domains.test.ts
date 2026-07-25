/**
 * Focused unit tests for Fase 3 core-domain admin Zod payloads and the booking
 * state machine expectations. DB-free: only imports validation + enum constants,
 * mirroring tests/unit/admin-partial-modules.test.ts.
 */
import {
  adminRfqStatusSchema,
  adminRfqCancelSchema,
  adminRfqFlagSchema,
  adminBookingStatusSchema,
  adminBookingRescheduleSchema,
  adminListReviewsSchema,
  adminReviewHideSchema,
  adminReferralDecisionSchema,
  adminLiveTerminateSchema,
  adminLivePinProductsSchema,
  liveCommentParamSchema,
} from '../../src/validations/admin-core.validation';

// Mirror of BOOKING_STATUS_TRANSITIONS in admin-core.service.ts.
const BOOKING_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['FULFILLED', 'CANCELLED'],
  EXPIRED: [],
  CANCELLED: [],
  FULFILLED: [],
};

describe('admin core domains — booking transitions', () => {
  it('allows PENDING_PAYMENT → CONFIRMED and CONFIRMED → FULFILLED', () => {
    expect(BOOKING_STATUS_TRANSITIONS.PENDING_PAYMENT).toContain('CONFIRMED');
    expect(BOOKING_STATUS_TRANSITIONS.CONFIRMED).toContain('FULFILLED');
  });

  it('forbids transitions out of terminal states', () => {
    expect(BOOKING_STATUS_TRANSITIONS.FULFILLED).toHaveLength(0);
    expect(BOOKING_STATUS_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(BOOKING_STATUS_TRANSITIONS.EXPIRED).toHaveLength(0);
  });
});

describe('admin core domains — RFQ schemas', () => {
  it('requires a reason for status changes', () => {
    expect(adminRfqStatusSchema.safeParse({ status: 'MATCHED' }).success).toBe(false);
    expect(adminRfqStatusSchema.safeParse({ status: 'MATCHED', reason: 'cocok' }).success).toBe(
      true,
    );
  });

  it('rejects invalid RFQ status enums', () => {
    expect(adminRfqStatusSchema.safeParse({ status: 'FROZEN', reason: 'apapun' }).success).toBe(
      false,
    );
  });

  it('requires a >=10 char reason to cancel', () => {
    expect(adminRfqCancelSchema.safeParse({ reason: 'short' }).success).toBe(false);
    expect(adminRfqCancelSchema.safeParse({ reason: 'Melanggar kebijakan platform' }).success).toBe(
      true,
    );
  });

  it('accepts flag payloads with optional reason', () => {
    expect(adminRfqFlagSchema.safeParse({ flagged: true, reason: 'spam' }).success).toBe(true);
    expect(adminRfqFlagSchema.safeParse({ flagged: false }).success).toBe(true);
  });
});

describe('admin core domains — booking schemas', () => {
  it('validates booking status enum + reason', () => {
    expect(
      adminBookingStatusSchema.safeParse({ status: 'CONFIRMED', reason: 'lunas' }).success,
    ).toBe(true);
    expect(adminBookingStatusSchema.safeParse({ status: 'DONE', reason: 'lunas' }).success).toBe(
      false,
    );
  });

  it('reschedule requires at least one date', () => {
    expect(adminBookingRescheduleSchema.safeParse({ reason: 'ganti jadwal' }).success).toBe(false);
    expect(
      adminBookingRescheduleSchema.safeParse({
        reason: 'ganti jadwal',
        expiresAt: '2026-08-01T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('admin core domains — review schemas', () => {
  it('parses rating + status query filters', () => {
    const parsed = adminListReviewsSchema.safeParse({ rating: '4', status: 'flagged' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.rating).toBe(4);
  });

  it('rejects out-of-range rating', () => {
    expect(adminListReviewsSchema.safeParse({ rating: '9' }).success).toBe(false);
  });

  it('requires >=10 char reason to hide a review', () => {
    expect(adminReviewHideSchema.safeParse({ reason: 'kasar' }).success).toBe(false);
    expect(adminReviewHideSchema.safeParse({ reason: 'Mengandung ujaran kebencian' }).success).toBe(
      true,
    );
  });
});

describe('admin core domains — referral + live schemas', () => {
  it('requires a reason for referral decisions', () => {
    expect(adminReferralDecisionSchema.safeParse({}).success).toBe(false);
    expect(adminReferralDecisionSchema.safeParse({ reason: 'valid' }).success).toBe(true);
  });

  it('requires a reason to terminate live sessions', () => {
    expect(adminLiveTerminateSchema.safeParse({ reason: 'abcde' }).success).toBe(true);
    expect(adminLiveTerminateSchema.safeParse({ reason: 'ab' }).success).toBe(false);
  });

  it('caps pinned products at 10 and validates uuids', () => {
    expect(adminLivePinProductsSchema.safeParse({ pinnedProductIds: ['not-a-uuid'] }).success).toBe(
      false,
    );
    expect(
      adminLivePinProductsSchema.safeParse({
        pinnedProductIds: Array.from({ length: 11 }, () => '00000000-0000-0000-0000-000000000000'),
      }).success,
    ).toBe(false);
  });

  it('requires both session id and comment id for comment moderation params', () => {
    expect(
      liveCommentParamSchema.safeParse({
        id: '00000000-0000-0000-0000-000000000000',
        commentId: '00000000-0000-0000-0000-000000000001',
      }).success,
    ).toBe(true);
    expect(
      liveCommentParamSchema.safeParse({ id: '00000000-0000-0000-0000-000000000000' }).success,
    ).toBe(false);
  });
});
