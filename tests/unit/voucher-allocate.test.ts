jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {},
}));

import { Prisma } from '#prisma';
import { allocateVoucherDiscount } from '../../src/services/voucher.service';

describe('allocateVoucherDiscount (FB-24)', () => {
  it('returns zero when subtotal or discount is zero', () => {
    expect(
      allocateVoucherDiscount(
        new Prisma.Decimal(100_000),
        new Prisma.Decimal(0),
        new Prisma.Decimal(10_000),
      ).toNumber(),
    ).toBe(0);
  });

  it('splits discount proportionally between sellers', () => {
    const total = new Prisma.Decimal(1_000_000);
    const discount = new Prisma.Decimal(100_000);
    const sellerA = allocateVoucherDiscount(new Prisma.Decimal(600_000), total, discount);
    const sellerB = allocateVoucherDiscount(new Prisma.Decimal(400_000), total, discount);

    expect(sellerA.toNumber()).toBe(60_000);
    expect(sellerB.toNumber()).toBe(40_000);
    expect(sellerA.add(sellerB).toNumber()).toBe(100_000);
  });
});
