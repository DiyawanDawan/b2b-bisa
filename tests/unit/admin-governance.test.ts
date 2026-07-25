/**
 * Focused unit tests for Fase 4 governance Zod payloads (audit-log export,
 * supplier API keys, platform bank accounts, AI config, waste data sources).
 * DB-free: only imports validation schemas, mirroring
 * tests/unit/admin-core-domains.test.ts.
 */
import {
  adminListAuditLogsSchema,
  adminExportAuditLogsSchema,
  adminCreateApiKeySchema,
  adminRevokeApiKeySchema,
  adminCreatePlatformAccountSchema,
  adminUpdatePlatformAccountSchema,
  adminAiConfigSchema,
  adminCreateWasteDataSchema,
  adminUpdateWasteDataSchema,
} from '../../src/validations/admin-governance.validation';

const UUID = '00000000-0000-0000-0000-000000000000';

describe('admin governance — audit log schemas', () => {
  it('accepts date filters in YYYY-MM-DD and rejects other formats', () => {
    expect(
      adminListAuditLogsSchema.safeParse({ dateFrom: '2026-07-01', dateTo: '2026-07-25' }).success,
    ).toBe(true);
    expect(adminListAuditLogsSchema.safeParse({ dateFrom: '01/07/2026' }).success).toBe(false);
  });

  it('export requires a range of at most 31 days', () => {
    expect(
      adminExportAuditLogsSchema.safeParse({ dateFrom: '2026-06-01', dateTo: '2026-07-25' })
        .success,
    ).toBe(false);
    expect(
      adminExportAuditLogsSchema.safeParse({ dateFrom: '2026-07-01', dateTo: '2026-07-25' })
        .success,
    ).toBe(true);
  });

  it('export rejects dateTo before dateFrom', () => {
    expect(
      adminExportAuditLogsSchema.safeParse({ dateFrom: '2026-07-25', dateTo: '2026-07-01' })
        .success,
    ).toBe(false);
  });
});

describe('admin governance — API key schemas', () => {
  it('requires a uuid userId and a name of at least 2 chars', () => {
    expect(adminCreateApiKeySchema.safeParse({ userId: 'abc', name: 'ERP' }).success).toBe(false);
    expect(adminCreateApiKeySchema.safeParse({ userId: UUID, name: 'E' }).success).toBe(false);
    expect(adminCreateApiKeySchema.safeParse({ userId: UUID, name: 'ERP Gudang' }).success).toBe(
      true,
    );
  });

  it('only accepts known scopes', () => {
    expect(
      adminCreateApiKeySchema.safeParse({ userId: UUID, name: 'ERP', scopes: ['products:read'] })
        .success,
    ).toBe(true);
    expect(
      adminCreateApiKeySchema.safeParse({ userId: UUID, name: 'ERP', scopes: ['admin:all'] })
        .success,
    ).toBe(false);
    expect(
      adminCreateApiKeySchema.safeParse({ userId: UUID, name: 'ERP', scopes: [] }).success,
    ).toBe(false);
  });

  it('requires a >=5 char reason to revoke', () => {
    expect(adminRevokeApiKeySchema.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(adminRevokeApiKeySchema.safeParse({ reason: 'kunci bocor' }).success).toBe(true);
  });
});

describe('admin governance — platform bank account schemas', () => {
  const base = {
    paymentChannelId: UUID,
    accountNumber: '1234567890',
    accountName: 'PT BISA EKOSISTEM INDONESIA',
  };

  it('accepts a valid payload and defaults are optional', () => {
    expect(adminCreatePlatformAccountSchema.safeParse(base).success).toBe(true);
  });

  it('rejects non-numeric account numbers', () => {
    expect(
      adminCreatePlatformAccountSchema.safeParse({ ...base, accountNumber: 'ABC123' }).success,
    ).toBe(false);
  });

  it('normalizes and validates ISO currency codes', () => {
    const parsed = adminCreatePlatformAccountSchema.safeParse({ ...base, currency: 'usd' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.currency).toBe('USD');
    expect(
      adminCreatePlatformAccountSchema.safeParse({ ...base, currency: 'RUPIAH' }).success,
    ).toBe(false);
  });

  it('update requires at least one field', () => {
    expect(adminUpdatePlatformAccountSchema.safeParse({}).success).toBe(false);
    expect(adminUpdatePlatformAccountSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('admin governance — AI config schema', () => {
  it('rejects an empty payload', () => {
    expect(adminAiConfigSchema.safeParse({}).success).toBe(false);
  });

  it('accepts toggles and numeric config within bounds', () => {
    expect(adminAiConfigSchema.safeParse({ assistantEnabled: false }).success).toBe(true);
    expect(adminAiConfigSchema.safeParse({ assistantTimeoutMs: 15000 }).success).toBe(true);
    expect(adminAiConfigSchema.safeParse({ assistantTimeoutMs: 100 }).success).toBe(false);
    expect(adminAiConfigSchema.safeParse({ defaultYield: 150 }).success).toBe(false);
  });
});

describe('admin governance — waste data schemas', () => {
  const base = {
    province: 'Nusa Tenggara Barat',
    biomassaType: 'SEKAM_PADI',
    volumeTon: 1200.5,
    year: 2026,
  };

  it('accepts a valid payload without coordinates', () => {
    expect(adminCreateWasteDataSchema.safeParse(base).success).toBe(true);
  });

  it('enforces the year range 2000..2100', () => {
    expect(adminCreateWasteDataSchema.safeParse({ ...base, year: 1999 }).success).toBe(false);
    expect(adminCreateWasteDataSchema.safeParse({ ...base, year: 2101 }).success).toBe(false);
  });

  it('rejects negative volumes and unknown biomassa types', () => {
    expect(adminCreateWasteDataSchema.safeParse({ ...base, volumeTon: -1 }).success).toBe(false);
    expect(adminCreateWasteDataSchema.safeParse({ ...base, biomassaType: 'PLASTIK' }).success).toBe(
      false,
    );
  });

  it('requires lat and lng to be paired and within range', () => {
    expect(adminCreateWasteDataSchema.safeParse({ ...base, lat: -8.65 }).success).toBe(false);
    expect(adminCreateWasteDataSchema.safeParse({ ...base, lat: -8.65, lng: 116.32 }).success).toBe(
      true,
    );
    expect(adminCreateWasteDataSchema.safeParse({ ...base, lat: 95, lng: 116.32 }).success).toBe(
      false,
    );
  });

  it('update requires at least one field and keeps lat/lng pairing', () => {
    expect(adminUpdateWasteDataSchema.safeParse({}).success).toBe(false);
    expect(adminUpdateWasteDataSchema.safeParse({ volumeTon: 900 }).success).toBe(true);
    expect(adminUpdateWasteDataSchema.safeParse({ lat: -8.1 }).success).toBe(false);
  });
});
