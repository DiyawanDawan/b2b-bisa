import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { Prisma, VoucherScope, VoucherType } from '#prisma';

const roundIdr = (v: Prisma.Decimal) => new Prisma.Decimal(Math.round(Number(v)));

export type VoucherValidationInput = {
  code: string;
  userId: string;
  subtotal: Prisma.Decimal;
  sellerIds?: string[];
};

export type VoucherValidationResult = {
  voucherId: string;
  code: string;
  type: VoucherType;
  discountAmount: Prisma.Decimal;
  message: string;
};

const assertVoucherActive = (voucher: {
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
}) => {
  const now = new Date();
  if (!voucher.isActive) throw new AppError('Kode promo tidak aktif.', 400);
  if (voucher.startsAt && voucher.startsAt > now) {
    throw new AppError('Kode promo belum berlaku.', 400);
  }
  if (voucher.expiresAt && voucher.expiresAt < now) {
    throw new AppError('Kode promo sudah kedaluwarsa.', 400);
  }
  if (voucher.usageLimit != null && voucher.usageCount >= voucher.usageLimit) {
    throw new AppError('Kuota kode promo sudah habis.', 400);
  }
};

export const validateVoucherForCheckout = async (
  input: VoucherValidationInput,
): Promise<VoucherValidationResult> => {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new AppError('Kode promo wajib diisi.', 400);

  const voucher = await prisma.voucher.findUnique({
    where: { code },
  });
  if (!voucher) throw new AppError('Kode promo tidak valid.', 404);

  assertVoucherActive(voucher);

  if (input.subtotal.lt(voucher.minOrderAmount)) {
    throw new AppError(
      `Minimal belanja ${Number(voucher.minOrderAmount).toLocaleString('id-ID')} untuk kode ini.`,
      400,
    );
  }

  if (voucher.scope === VoucherScope.SUPPLIER && voucher.supplierId) {
    const sellers = input.sellerIds ?? [];
    if (!sellers.includes(voucher.supplierId)) {
      throw new AppError('Kode promo tidak berlaku untuk toko ini.', 400);
    }
  }

  const userUsage = await prisma.voucherRedemption.count({
    where: { voucherId: voucher.id, userId: input.userId },
  });
  if (userUsage >= voucher.usagePerUser) {
    throw new AppError('Anda sudah menggunakan kode promo ini.', 400);
  }

  let discount = new Prisma.Decimal(0);
  if (voucher.type === VoucherType.PERCENT) {
    discount = input.subtotal.mul(voucher.value).div(100);
    if (voucher.maxDiscount) {
      discount = Prisma.Decimal.min(discount, voucher.maxDiscount);
    }
  } else {
    discount = voucher.value;
  }
  discount = roundIdr(Prisma.Decimal.min(discount, input.subtotal));

  if (discount.lte(0)) {
    throw new AppError('Kode promo tidak memberikan diskon untuk pesanan ini.', 400);
  }

  return {
    voucherId: voucher.id,
    code: voucher.code,
    type: voucher.type,
    discountAmount: discount,
    message: `Diskon ${Number(discount).toLocaleString('id-ID')} diterapkan.`,
  };
};

/** Distribusi diskon proporsional per seller berdasarkan subtotal. */
export const allocateVoucherDiscount = (
  sellerSubtotal: Prisma.Decimal,
  totalSubtotal: Prisma.Decimal,
  totalDiscount: Prisma.Decimal,
): Prisma.Decimal => {
  if (totalSubtotal.lte(0) || totalDiscount.lte(0)) {
    return new Prisma.Decimal(0);
  }
  return roundIdr(sellerSubtotal.div(totalSubtotal).mul(totalDiscount));
};

export const redeemVoucherForOrder = async (params: {
  voucherId: string;
  userId: string;
  orderId: string;
  discountAmount: Prisma.Decimal;
}) => {
  await prisma.$transaction([
    prisma.voucherRedemption.create({
      data: {
        voucherId: params.voucherId,
        userId: params.userId,
        orderId: params.orderId,
        discountAmount: params.discountAmount,
      },
    }),
    prisma.voucher.update({
      where: { id: params.voucherId },
      data: { usageCount: { increment: 1 } },
    }),
  ]);
};

export const validateVoucherPreview = async (
  userId: string,
  code: string,
  subtotal: number,
  sellerIds?: string[],
) => {
  const result = await validateVoucherForCheckout({
    code,
    userId,
    subtotal: new Prisma.Decimal(subtotal),
    sellerIds,
  });
  return {
    code: result.code,
    type: result.type,
    discountAmount: Number(result.discountAmount),
    message: result.message,
  };
};

export type CreateVoucherAdminInput = {
  code: string;
  type: VoucherType;
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number | null;
  scope?: VoucherScope;
  supplierId?: string | null;
  usageLimit?: number | null;
  usagePerUser?: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive?: boolean;
};

export type UpdateVoucherAdminInput = {
  type?: VoucherType;
  value?: number;
  minOrderAmount?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usagePerUser?: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive?: boolean;
};

export type ListVouchersAdminQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  period?: 'active_now' | 'upcoming' | 'expired';
};

const voucherAdminInclude = {
  supplier: { select: { id: true, fullName: true, email: true } },
  _count: { select: { redemptions: true } },
} as const;

const buildPeriodWhere = (period: ListVouchersAdminQuery['period']): Prisma.VoucherWhereInput => {
  const now = new Date();
  if (period === 'active_now') {
    return {
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    };
  }
  if (period === 'upcoming') {
    return { startsAt: { gt: now } };
  }
  if (period === 'expired') {
    return { expiresAt: { lt: now } };
  }
  return {};
};

export const createVoucherAdmin = async (input: CreateVoucherAdminInput) => {
  const code = input.code.trim().toUpperCase();
  const scope = input.scope ?? VoucherScope.PLATFORM;

  if (scope === VoucherScope.SUPPLIER && !input.supplierId) {
    throw new AppError('supplierId wajib untuk voucher SUPPLIER.', 400);
  }

  if (input.supplierId) {
    const supplier = await prisma.user.findFirst({
      where: { id: input.supplierId, role: 'SUPPLIER' },
      select: { id: true },
    });
    if (!supplier) throw new AppError('Supplier tidak ditemukan.', 404);
  }

  const existing = await prisma.voucher.findUnique({ where: { code } });
  if (existing) throw new AppError('Kode voucher sudah dipakai.', 409);

  return prisma.voucher.create({
    data: {
      code,
      type: input.type,
      value: new Prisma.Decimal(input.value),
      minOrderAmount: new Prisma.Decimal(input.minOrderAmount ?? 0),
      maxDiscount: input.maxDiscount != null ? new Prisma.Decimal(input.maxDiscount) : null,
      scope,
      supplierId: scope === VoucherScope.SUPPLIER ? input.supplierId : null,
      usageLimit: input.usageLimit ?? null,
      usagePerUser: input.usagePerUser ?? 1,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      isActive: input.isActive ?? true,
    },
    include: voucherAdminInclude,
  });
};

export const listVouchersAdmin = async (query: ListVouchersAdminQuery = {}) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const skip = (page - 1) * limit;
  const search = query.search?.trim();

  const where: Prisma.VoucherWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...buildPeriodWhere(query.period),
    ...(search
      ? {
          OR: [
            { code: { contains: search } },
            { supplier: { fullName: { contains: search } } },
            { supplier: { email: { contains: search } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: voucherAdminInclude,
    }),
    prisma.voucher.count({ where }),
  ]);

  return { items, total, page, limit };
};

export const updateVoucherAdmin = async (id: string, data: UpdateVoucherAdminInput) => {
  const row = await prisma.voucher.findUnique({ where: { id } });
  if (!row) throw new AppError('Voucher tidak ditemukan.', 404);

  const nextType = data.type ?? row.type;
  if (nextType === VoucherType.PERCENT && data.value != null && data.value > 100) {
    throw new AppError('Persentase diskon maksimal 100.', 400);
  }

  const startsAt = data.startsAt !== undefined ? data.startsAt : row.startsAt;
  const expiresAt = data.expiresAt !== undefined ? data.expiresAt : row.expiresAt;
  if (startsAt && expiresAt && startsAt > expiresAt) {
    throw new AppError('Tanggal mulai tidak boleh setelah tanggal berakhir.', 400);
  }

  return prisma.voucher.update({
    where: { id },
    data: {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: new Prisma.Decimal(data.value) } : {}),
      ...(data.minOrderAmount !== undefined
        ? { minOrderAmount: new Prisma.Decimal(data.minOrderAmount) }
        : {}),
      ...(data.maxDiscount !== undefined
        ? {
            maxDiscount: data.maxDiscount != null ? new Prisma.Decimal(data.maxDiscount) : null,
          }
        : {}),
      ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
      ...(data.usagePerUser !== undefined ? { usagePerUser: data.usagePerUser } : {}),
      ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: voucherAdminInclude,
  });
};

export const getVoucherUsageAdmin = async (id: string) => {
  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: voucherAdminInclude,
  });
  if (!voucher) throw new AppError('Voucher tidak ditemukan.', 404);

  const [aggregate, uniqueUsers, recentRedemptions] = await Promise.all([
    prisma.voucherRedemption.aggregate({
      where: { voucherId: id },
      _sum: { discountAmount: true },
      _count: { _all: true },
    }),
    prisma.voucherRedemption.groupBy({
      by: ['userId'],
      where: { voucherId: id },
    }),
    prisma.voucherRedemption.findMany({
      where: { voucherId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    }),
  ]);

  return {
    voucher,
    stats: {
      redemptionCount: aggregate._count._all,
      uniqueUsers: uniqueUsers.length,
      totalDiscountAmount: Number(aggregate._sum.discountAmount ?? 0),
      usageCount: voucher.usageCount,
      usageLimit: voucher.usageLimit,
      remainingQuota:
        voucher.usageLimit == null ? null : Math.max(0, voucher.usageLimit - voucher.usageCount),
    },
    recentRedemptions,
  };
};

/**
 * Safe lifecycle: hard-delete unused vouchers; otherwise soft-disable.
 */
export const deleteOrDisableVoucherAdmin = async (id: string) => {
  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!voucher) throw new AppError('Voucher tidak ditemukan.', 404);

  if (voucher._count.redemptions > 0 || voucher.usageCount > 0) {
    const item = await prisma.voucher.update({
      where: { id },
      data: { isActive: false },
      include: voucherAdminInclude,
    });
    return {
      action: 'disabled' as const,
      message:
        'Voucher sudah pernah dipakai; dinonaktifkan (soft-disable) agar histori tetap utuh.',
      item,
    };
  }

  await prisma.voucher.delete({ where: { id } });
  return {
    action: 'deleted' as const,
    message: 'Voucher tanpa pemakaian berhasil dihapus.',
    item: null,
  };
};
