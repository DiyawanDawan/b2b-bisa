import { bulkFinanceStatusSchema } from '../../src/validations/admin.validation';

const UUID = '00000000-0000-0000-0000-000000000000';

describe('bulkFinanceStatusSchema', () => {
  it('requires isActive as a boolean', () => {
    expect(bulkFinanceStatusSchema.safeParse({ all: true }).success).toBe(false);
    expect(bulkFinanceStatusSchema.safeParse({ isActive: 'yes', all: true }).success).toBe(false);
  });

  it('needs at least one selector (ids, group, or all)', () => {
    expect(bulkFinanceStatusSchema.safeParse({ isActive: false }).success).toBe(false);
    expect(bulkFinanceStatusSchema.safeParse({ isActive: false, all: true }).success).toBe(true);
    expect(bulkFinanceStatusSchema.safeParse({ isActive: false, group: 'E_WALLET' }).success).toBe(
      true,
    );
    expect(bulkFinanceStatusSchema.safeParse({ isActive: true, ids: [UUID] }).success).toBe(true);
  });

  it('rejects invalid uuid ids and unknown groups', () => {
    expect(bulkFinanceStatusSchema.safeParse({ isActive: true, ids: ['abc'] }).success).toBe(false);
    expect(bulkFinanceStatusSchema.safeParse({ isActive: true, group: 'CRYPTO' }).success).toBe(
      false,
    );
  });
});
