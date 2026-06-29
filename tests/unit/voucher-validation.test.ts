jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    voucher: { findUnique: jest.fn() },
    voucherRedemption: { count: jest.fn() },
  },
}));

import { Prisma, VoucherScope, VoucherType } from '#prisma';
import prisma from '#config/prisma';
import { validateVoucherForCheckout } from '../../src/services/voucher.service';
import AppError from '../../src/utils/appError';

const mockPrisma = prisma as unknown as {
  voucher: { findUnique: jest.Mock };
  voucherRedemption: { count: jest.Mock };
};

describe('validateVoucherForCheckout (FB-24)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.voucherRedemption.count.mockResolvedValue(0);
  });

  it('rejects empty code', async () => {
    await expect(
      validateVoucherForCheckout({
        code: '   ',
        userId: 'u1',
        subtotal: new Prisma.Decimal(500_000),
      }),
    ).rejects.toThrow(AppError);
  });

  it('applies percent discount capped by maxDiscount', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'v1',
      code: 'PROMO10',
      type: VoucherType.PERCENT,
      value: new Prisma.Decimal(10),
      maxDiscount: new Prisma.Decimal(50_000),
      minOrderAmount: new Prisma.Decimal(100_000),
      scope: VoucherScope.PLATFORM,
      supplierId: null,
      isActive: true,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      usageCount: 0,
      usagePerUser: 1,
    });

    const result = await validateVoucherForCheckout({
      code: 'promo10',
      userId: 'buyer-1',
      subtotal: new Prisma.Decimal(1_000_000),
    });

    expect(result.discountAmount.toNumber()).toBe(50_000);
    expect(result.code).toBe('PROMO10');
  });

  it('rejects supplier voucher when seller not in cart', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue({
      id: 'v2',
      code: 'TOKO-A',
      type: VoucherType.FIXED,
      value: new Prisma.Decimal(25_000),
      maxDiscount: null,
      minOrderAmount: new Prisma.Decimal(0),
      scope: VoucherScope.SUPPLIER,
      supplierId: 'seller-99',
      isActive: true,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      usageCount: 0,
      usagePerUser: 1,
    });

    await expect(
      validateVoucherForCheckout({
        code: 'TOKO-A',
        userId: 'buyer-1',
        subtotal: new Prisma.Decimal(200_000),
        sellerIds: ['seller-other'],
      }),
    ).rejects.toThrow('tidak berlaku untuk toko');
  });
});
