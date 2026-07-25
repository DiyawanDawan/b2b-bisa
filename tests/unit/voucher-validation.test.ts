jest.mock('#config/prisma', () => ({
  __esModule: true,
  default: {
    voucher: { findUnique: jest.fn() },
    voucherRedemption: { count: jest.fn() },
  },
}));

import { Prisma, ProductMode, VoucherScope, VoucherType } from '#prisma';
import prisma from '#config/prisma';
import { validateVoucherForCheckout } from '../../src/services/voucher.service';
import AppError from '../../src/utils/appError';

const mockPrisma = prisma as unknown as {
  voucher: { findUnique: jest.Mock };
  voucherRedemption: { count: jest.Mock };
};

const baseVoucher = {
  maxDiscount: null as Prisma.Decimal | null,
  minOrderAmount: new Prisma.Decimal(0),
  supplierId: null as string | null,
  categoryId: null as string | null,
  productId: null as string | null,
  productMode: null as ProductMode | null,
  isActive: true,
  startsAt: null as Date | null,
  expiresAt: null as Date | null,
  usageLimit: null as number | null,
  usageCount: 0,
  usagePerUser: 1,
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
      ...baseVoucher,
      id: 'v1',
      code: 'PROMO10',
      type: VoucherType.PERCENT,
      value: new Prisma.Decimal(10),
      maxDiscount: new Prisma.Decimal(50_000),
      minOrderAmount: new Prisma.Decimal(100_000),
      scope: VoucherScope.PLATFORM,
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
      ...baseVoucher,
      id: 'v2',
      code: 'TOKO-A',
      type: VoucherType.FIXED,
      value: new Prisma.Decimal(25_000),
      scope: VoucherScope.SUPPLIER,
      supplierId: 'seller-99',
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

  it('applies product-mode voucher only to matching lines', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue({
      ...baseVoucher,
      id: 'v3',
      code: 'ORGANIK10',
      type: VoucherType.PERCENT,
      value: new Prisma.Decimal(10),
      scope: VoucherScope.PRODUCT_MODE,
      productMode: ProductMode.ORGANIC_PRODUCE,
    });

    const result = await validateVoucherForCheckout({
      code: 'ORGANIK10',
      userId: 'buyer-1',
      subtotal: new Prisma.Decimal(300_000),
      cartLines: [
        {
          productId: 'p1',
          sellerId: 's1',
          categoryId: 'c1',
          productMode: ProductMode.ORGANIC_PRODUCE,
          lineSubtotal: new Prisma.Decimal(100_000),
        },
        {
          productId: 'p2',
          sellerId: 's2',
          categoryId: 'c2',
          productMode: ProductMode.BIOMASS_MATERIAL,
          lineSubtotal: new Prisma.Decimal(200_000),
        },
      ],
    });

    expect(result.discountAmount.toNumber()).toBe(10_000);
    expect(result.eligibleSubtotal.toNumber()).toBe(100_000);
    expect(result.eligibleSellerSubtotals.get('s1')?.toNumber()).toBe(100_000);
    expect(result.eligibleSellerSubtotals.has('s2')).toBe(false);
  });

  it('rejects category voucher when no matching cart lines', async () => {
    mockPrisma.voucher.findUnique.mockResolvedValue({
      ...baseVoucher,
      id: 'v4',
      code: 'CAT-ONLY',
      type: VoucherType.FIXED,
      value: new Prisma.Decimal(5_000),
      scope: VoucherScope.CATEGORY,
      categoryId: 'cat-biochar',
    });

    await expect(
      validateVoucherForCheckout({
        code: 'CAT-ONLY',
        userId: 'buyer-1',
        subtotal: new Prisma.Decimal(80_000),
        cartLines: [
          {
            productId: 'p9',
            sellerId: 's9',
            categoryId: 'cat-other',
            productMode: ProductMode.BIOMASS_MATERIAL,
            lineSubtotal: new Prisma.Decimal(80_000),
          },
        ],
      }),
    ).rejects.toThrow('tidak berlaku untuk kategori');
  });
});
