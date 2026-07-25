import {
  adminCreateCoverageSchema,
  adminCreateHubSchema,
  adminReportsQuerySchema,
  adminUpdateCoverageSchema,
  listShipmentsQuerySchema,
} from '../../src/validations/bisa-express.validation';
import { adminCan } from '../../src/constants/admin-permissions.constants';

describe('bisa-express admin validation (express-completion)', () => {
  it('accepts hub create with nested address payload', () => {
    const parsed = adminCreateHubSchema.parse({
      code: 'HUB-JKT-01',
      name: 'Hub Jakarta',
      address: {
        fullAddress: 'Jl. Contoh Hub BISA Express No. 1',
        latitude: -6.2,
        longitude: 106.8,
        zipCode: '10110',
      },
    });
    expect(parsed.code).toBe('HUB-JKT-01');
    expect(parsed.address?.fullAddress).toContain('Hub BISA');
  });

  it('rejects hub create without addressId or address', () => {
    expect(() =>
      adminCreateHubSchema.parse({
        code: 'HUB-X',
        name: 'Hub X',
      }),
    ).toThrow();
  });

  it('validates coverage create/update and report period', () => {
    const provinceId = '11111111-1111-1111-1111-111111111111';
    expect(
      adminCreateCoverageSchema.parse({
        provinceId,
        zone: 'JAWA_BARAT',
        isPickup: true,
      }).zone,
    ).toBe('JAWA_BARAT');

    expect(
      adminUpdateCoverageSchema.parse({
        isActive: false,
        zone: 'JABODETABEK',
      }),
    ).toMatchObject({ isActive: false, zone: 'JABODETABEK' });

    expect(adminReportsQuerySchema.parse({})).toEqual({});
    expect(
      adminReportsQuerySchema.parse({ startDate: '2026-01-01', endDate: '2026-01-31' }),
    ).toEqual({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(() => adminReportsQuerySchema.parse({ startDate: '01-01-2026' })).toThrow();
  });

  it('uses shared admin list defaults for shipments query', () => {
    expect(listShipmentsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it('allows export action on bisaExpress module', () => {
    expect(adminCan('bisaExpress', 'export')).toBe(true);
    expect(adminCan('bisaExpress', 'read')).toBe(true);
  });
});
