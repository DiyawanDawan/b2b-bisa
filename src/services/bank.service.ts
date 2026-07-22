import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { PaymentMethod, PaymentStatus, Prisma, TransactionType } from '#prisma';
import { invalidatePayChannels } from '#utils/cache.util';

const toNumber = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
};

/**
 * Mendapatkan semua bank yang didukung oleh sistem (publik / mobile).
 */
export const getAllBanks = async (onlyActive = true) => {
  return prisma.payoutBank.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: { name: 'asc' },
  });
};

export type AdminPayoutBankItem = {
  id: string;
  name: string;
  code: string;
  channelType: string | null;
  country: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  flightTime: string | null;
  logoUrl: string | null;
  isActive: boolean;
  usage: {
    accountCount: number;
    payoutCount: number;
    payoutVolume: number;
    pendingPayoutCount: number;
  };
  canDelete: boolean;
};

/**
 * [Admin] Daftar bank payout + statistik pemakaian.
 */
export const listPayoutBanksAdmin = async (params?: {
  search?: string;
  isActive?: boolean;
}): Promise<AdminPayoutBankItem[]> => {
  const where: Prisma.PayoutBankWhereInput = {};
  if (params?.isActive !== undefined) where.isActive = params.isActive;
  if (params?.search?.trim()) {
    const q = params.search.trim();
    where.OR = [{ name: { contains: q } }, { code: { contains: q } }];
  }

  const banks = await prisma.payoutBank.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { userPayoutAccounts: true } },
    },
  });

  const bankIds = banks.map((b) => b.id);
  const statsMap = new Map<
    string,
    { payoutCount: number; payoutVolume: number; pendingPayoutCount: number }
  >();

  if (bankIds.length > 0) {
    const payoutRows = await prisma.transaction.findMany({
      where: {
        type: TransactionType.PAYOUT,
        payoutAccount: { bankId: { in: bankIds } },
      },
      select: {
        amount: true,
        status: true,
        payoutAccount: { select: { bankId: true } },
      },
    });

    for (const row of payoutRows) {
      const bankId = row.payoutAccount?.bankId;
      if (!bankId) continue;
      const cur = statsMap.get(bankId) ?? {
        payoutCount: 0,
        payoutVolume: 0,
        pendingPayoutCount: 0,
      };
      cur.payoutCount += 1;
      cur.payoutVolume += toNumber(row.amount);
      if (row.status === 'PENDING') cur.pendingPayoutCount += 1;
      statsMap.set(bankId, cur);
    }
  }

  return banks.map((bank) => {
    const accountCount = bank._count.userPayoutAccounts;
    const stats = statsMap.get(bank.id) ?? {
      payoutCount: 0,
      payoutVolume: 0,
      pendingPayoutCount: 0,
    };

    return {
      id: bank.id,
      name: bank.name,
      code: bank.code,
      channelType: bank.channelType,
      country: bank.country,
      currency: bank.currency,
      minAmount: bank.minAmount != null ? toNumber(bank.minAmount) : null,
      maxAmount: bank.maxAmount != null ? toNumber(bank.maxAmount) : null,
      flightTime: bank.flightTime,
      logoUrl: bank.logoUrl,
      isActive: bank.isActive,
      usage: {
        accountCount,
        payoutCount: stats.payoutCount,
        payoutVolume: stats.payoutVolume,
        pendingPayoutCount: stats.pendingPayoutCount,
      },
      canDelete: accountCount === 0 && stats.payoutCount === 0,
    };
  });
};

/**
 * [Admin] Menambah bank payout baru.
 */
export const createBank = async (data: {
  code: string;
  name: string;
  logoUrl?: string;
  channelType?: string;
  country?: string;
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  flightTime?: string;
  isActive?: boolean;
}) => {
  const code = data.code.trim().toUpperCase();
  const existing = await prisma.payoutBank.findUnique({ where: { code } });
  if (existing) throw new AppError('Kode bank sudah ada', 400);

  const nameTaken = await prisma.payoutBank.findUnique({ where: { name: data.name.trim() } });
  if (nameTaken) throw new AppError('Nama bank sudah ada', 400);

  return prisma.payoutBank.create({
    data: {
      code,
      name: data.name.trim(),
      logoUrl: data.logoUrl,
      channelType: data.channelType,
      country: data.country ?? 'ID',
      currency: data.currency ?? 'IDR',
      minAmount: data.minAmount != null ? new Prisma.Decimal(data.minAmount) : undefined,
      maxAmount: data.maxAmount != null ? new Prisma.Decimal(data.maxAmount) : undefined,
      flightTime: data.flightTime,
      isActive: data.isActive ?? true,
    },
  });
};

/**
 * [Admin] Update info bank (termasuk aktif/nonaktif).
 */
export const updateBank = async (
  id: string,
  data: {
    name?: string;
    code?: string;
    logoUrl?: string | null;
    channelType?: string | null;
    country?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    flightTime?: string | null;
    isActive?: boolean;
  },
) => {
  const bank = await prisma.payoutBank.findUnique({ where: { id } });
  if (!bank) throw new AppError('Bank tidak ditemukan', 404);

  if (data.code && data.code.trim().toUpperCase() !== bank.code) {
    const code = data.code.trim().toUpperCase();
    const clash = await prisma.payoutBank.findUnique({ where: { code } });
    if (clash) throw new AppError('Kode bank sudah dipakai bank lain', 400);
  }

  if (data.name && data.name.trim() !== bank.name) {
    const clash = await prisma.payoutBank.findUnique({ where: { name: data.name.trim() } });
    if (clash) throw new AppError('Nama bank sudah dipakai bank lain', 400);
  }

  return prisma.payoutBank.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.channelType !== undefined ? { channelType: data.channelType } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.flightTime !== undefined ? { flightTime: data.flightTime } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.minAmount !== undefined
        ? { minAmount: data.minAmount == null ? null : new Prisma.Decimal(data.minAmount) }
        : {}),
      ...(data.maxAmount !== undefined
        ? { maxAmount: data.maxAmount == null ? null : new Prisma.Decimal(data.maxAmount) }
        : {}),
    },
  });
};

/**
 * [Admin] Hapus bank — diblokir jika sudah dipakai rekening / payout.
 * Prefer nonaktifkan (isActive=false) daripada hapus.
 */
export const deleteBank = async (id: string) => {
  const bank = await prisma.payoutBank.findUnique({
    where: { id },
    include: {
      _count: { select: { userPayoutAccounts: true } },
    },
  });
  if (!bank) throw new AppError('Bank tidak ditemukan', 404);

  if (bank._count.userPayoutAccounts > 0) {
    throw new AppError(
      'Bank tidak bisa dihapus karena sudah dipakai rekening payout user. Nonaktifkan saja agar tidak tersedia untuk rekening baru.',
      400,
    );
  }

  const payoutLinked = await prisma.transaction.count({
    where: {
      type: TransactionType.PAYOUT,
      payoutAccount: { bankId: id },
    },
  });
  if (payoutLinked > 0) {
    throw new AppError(
      'Bank tidak bisa dihapus karena sudah dipakai transaksi penarikan. Nonaktifkan saja.',
      400,
    );
  }

  return prisma.payoutBank.delete({ where: { id } });
};

export type AdminPaymentChannelItem = {
  id: string;
  name: string;
  code: string;
  group: PaymentMethod | null;
  country: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  settlementTime: string | null;
  xenditType: string | null;
  logoUrl: string | null;
  isActive: boolean;
  usage: {
    transactionCount: number;
    paidVolume: number;
    platformAccountCount: number;
  };
  canDelete: boolean;
};

/**
 * [Admin] Daftar channel pembayaran + statistik pemakaian.
 */
export const listPaymentChannelsAdmin = async (params?: {
  search?: string;
  isActive?: boolean;
}): Promise<AdminPaymentChannelItem[]> => {
  const where: Prisma.PaymentChannelWhereInput = {};
  if (params?.isActive !== undefined) where.isActive = params.isActive;
  if (params?.search?.trim()) {
    const q = params.search.trim();
    where.OR = [{ name: { contains: q } }, { code: { contains: q } }];
  }

  const channels = await prisma.paymentChannel.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { transactions: true, platformAccounts: true },
      },
    },
  });

  const channelIds = channels.map((c) => c.id);
  const volumeMap = new Map<string, number>();

  if (channelIds.length > 0) {
    const paidRows = await prisma.transaction.groupBy({
      by: ['paymentChannelId'],
      where: {
        paymentChannelId: { in: channelIds },
        paymentStatus: PaymentStatus.SUCCESS,
      },
      _sum: { amount: true },
    });
    for (const row of paidRows) {
      if (row.paymentChannelId) {
        volumeMap.set(row.paymentChannelId, toNumber(row._sum.amount));
      }
    }
  }

  return channels.map((ch) => {
    const transactionCount = ch._count.transactions;
    const platformAccountCount = ch._count.platformAccounts;

    return {
      id: ch.id,
      name: ch.name,
      code: ch.code,
      group: ch.group,
      country: ch.country,
      currency: ch.currency,
      minAmount: ch.minAmount != null ? toNumber(ch.minAmount) : null,
      maxAmount: ch.maxAmount != null ? toNumber(ch.maxAmount) : null,
      settlementTime: ch.settlementTime,
      xenditType: ch.xenditType,
      logoUrl: ch.logoUrl,
      isActive: ch.isActive,
      usage: {
        transactionCount,
        paidVolume: volumeMap.get(ch.id) ?? 0,
        platformAccountCount,
      },
      canDelete: transactionCount === 0 && platformAccountCount === 0,
    };
  });
};

export const createPaymentChannel = async (data: {
  name: string;
  code: string;
  group?: PaymentMethod;
  country?: string;
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  settlementTime?: string;
  xenditType?: string;
  logoUrl?: string;
  isActive?: boolean;
}) => {
  const code = data.code.trim().toUpperCase();
  const existing = await prisma.paymentChannel.findUnique({ where: { code } });
  if (existing) throw new AppError('Kode channel sudah ada', 400);

  const nameTaken = await prisma.paymentChannel.findUnique({ where: { name: data.name.trim() } });
  if (nameTaken) throw new AppError('Nama channel sudah ada', 400);

  const created = await prisma.paymentChannel.create({
    data: {
      name: data.name.trim(),
      code,
      group: data.group,
      country: data.country ?? 'ID',
      currency: data.currency ?? 'IDR',
      minAmount: data.minAmount != null ? new Prisma.Decimal(data.minAmount) : undefined,
      maxAmount: data.maxAmount != null ? new Prisma.Decimal(data.maxAmount) : undefined,
      settlementTime: data.settlementTime,
      xenditType: data.xenditType,
      logoUrl: data.logoUrl,
      isActive: data.isActive ?? true,
    },
  });
  await invalidatePayChannels();
  return created;
};

export const updatePaymentChannel = async (
  id: string,
  data: {
    name?: string;
    code?: string;
    group?: PaymentMethod | null;
    country?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    settlementTime?: string | null;
    xenditType?: string | null;
    logoUrl?: string | null;
    isActive?: boolean;
  },
) => {
  const channel = await prisma.paymentChannel.findUnique({ where: { id } });
  if (!channel) throw new AppError('Channel pembayaran tidak ditemukan', 404);

  if (data.code && data.code.trim().toUpperCase() !== channel.code) {
    const code = data.code.trim().toUpperCase();
    const clash = await prisma.paymentChannel.findUnique({ where: { code } });
    if (clash) throw new AppError('Kode channel sudah dipakai', 400);
  }

  if (data.name && data.name.trim() !== channel.name) {
    const clash = await prisma.paymentChannel.findUnique({ where: { name: data.name.trim() } });
    if (clash) throw new AppError('Nama channel sudah dipakai', 400);
  }

  const updated = await prisma.paymentChannel.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
      ...(data.group !== undefined ? { group: data.group } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.settlementTime !== undefined ? { settlementTime: data.settlementTime } : {}),
      ...(data.xenditType !== undefined ? { xenditType: data.xenditType } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.minAmount !== undefined
        ? { minAmount: data.minAmount == null ? null : new Prisma.Decimal(data.minAmount) }
        : {}),
      ...(data.maxAmount !== undefined
        ? { maxAmount: data.maxAmount == null ? null : new Prisma.Decimal(data.maxAmount) }
        : {}),
    },
  });
  await invalidatePayChannels();
  return updated;
};

/**
 * Hapus channel — diblokir jika sudah ada transaksi / rekening platform.
 */
export const deletePaymentChannel = async (id: string) => {
  const channel = await prisma.paymentChannel.findUnique({
    where: { id },
    include: {
      _count: { select: { transactions: true, platformAccounts: true } },
    },
  });
  if (!channel) throw new AppError('Channel pembayaran tidak ditemukan', 404);

  if (channel._count.transactions > 0) {
    throw new AppError(
      'Channel tidak bisa dihapus karena sudah dipakai transaksi. Nonaktifkan saja agar tidak tersedia di checkout.',
      400,
    );
  }
  if (channel._count.platformAccounts > 0) {
    throw new AppError(
      'Channel tidak bisa dihapus karena terhubung rekening platform. Nonaktifkan saja.',
      400,
    );
  }

  const deleted = await prisma.paymentChannel.delete({ where: { id } });
  await invalidatePayChannels();
  return deleted;
};
