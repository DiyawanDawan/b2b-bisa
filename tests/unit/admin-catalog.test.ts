/**
 * Focused unit tests for Fase 3 catalog admin Zod payloads.
 * Does not require DB or full prisma generate for most cases —
 * StoreBannerModerationStatus / HarvestLotStatus come from generated client.
 */
import {
  adminArchiveHarvestLotSchema,
  adminCreateCollectionSchema,
  adminUpdateCollectionSchema,
  adminAssignCollectionProductsSchema,
  adminModerateStoreBannerSchema,
  adminUpdateStoreBannerScheduleSchema,
  adminModerateProductQuestionSchema,
  adminAnswerProductQuestionSchema,
  adminListHarvestLotsSchema,
  adminListStoreBannersSchema,
} from '../../src/validations/admin-catalog.validation';

describe('admin catalog — harvest lots', () => {
  it('parses list query with status and archived', () => {
    const ok = adminListHarvestLotsSchema.safeParse({
      page: '1',
      limit: '10',
      status: 'SCHEDULED',
      archived: 'false',
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.archived).toBe(false);
      expect(ok.data.status).toBe('SCHEDULED');
    }
  });

  it('allows optional archive reason', () => {
    expect(adminArchiveHarvestLotSchema.safeParse({}).success).toBe(true);
    expect(adminArchiveHarvestLotSchema.safeParse({ reason: 'Arsip lama' }).success).toBe(true);
  });
});

describe('admin catalog — collections', () => {
  it('requires name and validates slug', () => {
    expect(adminCreateCollectionSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(
      adminCreateCollectionSchema.safeParse({
        name: 'Panen Minggu Ini',
        slug: 'Panen Minggu',
      }).success,
    ).toBe(false);
    expect(
      adminCreateCollectionSchema.safeParse({
        name: 'Panen Minggu Ini',
        slug: 'panen-minggu-ini',
        sortOrder: 2,
      }).success,
    ).toBe(true);
  });

  it('rejects empty update payload', () => {
    expect(adminUpdateCollectionSchema.safeParse({}).success).toBe(false);
    expect(adminUpdateCollectionSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('validates product assignment uuids', () => {
    expect(
      adminAssignCollectionProductsSchema.safeParse({
        productIds: ['not-uuid'],
      }).success,
    ).toBe(false);
    expect(
      adminAssignCollectionProductsSchema.safeParse({
        productIds: ['11111111-1111-1111-1111-111111111111'],
        replace: true,
      }).success,
    ).toBe(true);
  });
});

describe('admin catalog — store banners', () => {
  it('requires reason on reject', () => {
    const bad = adminModerateStoreBannerSchema.safeParse({ action: 'REJECT' });
    expect(bad.success).toBe(false);
    const ok = adminModerateStoreBannerSchema.safeParse({
      action: 'REJECT',
      reason: 'Gambar blur / tidak relevan',
    });
    expect(ok.success).toBe(true);
  });

  it('allows approve without reason', () => {
    expect(adminModerateStoreBannerSchema.safeParse({ action: 'APPROVE' }).success).toBe(true);
  });

  it('parses moderation filter query', () => {
    const ok = adminListStoreBannersSchema.safeParse({
      moderationStatus: 'PENDING',
      isActive: 'true',
    });
    expect(ok.success).toBe(true);
  });

  it('requires at least one schedule field', () => {
    expect(adminUpdateStoreBannerScheduleSchema.safeParse({}).success).toBe(false);
    expect(adminUpdateStoreBannerScheduleSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('admin catalog — product Q&A', () => {
  it('validates moderation actions', () => {
    expect(adminModerateProductQuestionSchema.safeParse({ action: 'HIDE' }).success).toBe(true);
    expect(adminModerateProductQuestionSchema.safeParse({ action: 'BAN' }).success).toBe(false);
  });

  it('requires non-empty answer', () => {
    expect(adminAnswerProductQuestionSchema.safeParse({ answer: 'a' }).success).toBe(false);
    expect(
      adminAnswerProductQuestionSchema.safeParse({
        answer: 'Produk tersedia minggu depan.',
      }).success,
    ).toBe(true);
  });
});
