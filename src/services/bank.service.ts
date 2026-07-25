import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { PaymentMethod, PaymentStatus, Prisma, TransactionType } from '#prisma';
import { invalidatePayChannels, invalidatePayoutBanks } from '#utils/cache.util';
import { createAuditLog } from '#services/admin.service';
import { formatPayoutAccountForList } from '#utils/payoutAccount.util';

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
  /** Jumlah rekening payout supplier yang memakai bank ini. */
  usageCount: number;
  usage: {
    accountCount: number;
    payoutCount: number;
    payoutVolume: number;
    pendingPayoutCount: number;
  };
  canDelete: boolean;
};

export type AdminPayoutBankUsageUser = {
  id: string;
  fullName: string;
  companyName: string | null;
  email: string;
  accountId: string;
  accountName: string | null;
  accountNumberMasked: string;
  isMain: boolean;
  createdAt: Date;
};

export type AdminPayoutBankUsage = {
  bankId: string;
  bankName: string;
  bankCode: string;
  usageCount: number;
  users: AdminPayoutBankUsageUser[];
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
      usageCount: accountCount,
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
 * [Admin] Siapa saja yang memakai bank payout ini (rekening supplier).
 */
export const getPayoutBankUsageAdmin = async (bankId: string): Promise<AdminPayoutBankUsage> => {
  const bank = await prisma.payoutBank.findUnique({
    where: { id: bankId },
    select: { id: true, name: true, code: true },
  });
  if (!bank) throw new AppError('Bank tidak ditemukan', 404);

  const accounts = await prisma.userPayoutAccount.findMany({
    where: { bankId },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      isMain: true,
      createdAt: true,
      userId: true,
      bankId: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profile: { select: { companyName: true } },
        },
      },
    },
  });

  const users: AdminPayoutBankUsageUser[] = accounts.map((account) => {
    const formatted = formatPayoutAccountForList(
      {
        accountNumber: account.accountNumber,
        accountName: account.accountName,
      },
      { userId: account.userId, bankId: account.bankId },
    );

    return {
      id: account.user.id,
      fullName: account.user.fullName,
      companyName: account.user.profile?.companyName ?? null,
      email: account.user.email,
      accountId: account.id,
      accountName: (formatted.accountName as string | null | undefined) ?? null,
      accountNumberMasked: formatted.maskedAccountNumber,
      isMain: account.isMain,
      createdAt: account.createdAt,
    };
  });

  return {
    bankId: bank.id,
    bankName: bank.name,
    bankCode: bank.code,
    usageCount: users.length,
    users,
  };
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

  const created = await prisma.payoutBank.create({
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
  await invalidatePayoutBanks();
  return created;
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

  const updated = await prisma.payoutBank.update({
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
  await invalidatePayoutBanks();
  return updated;
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

  const deleted = await prisma.payoutBank.delete({ where: { id } });
  await invalidatePayoutBanks();
  return deleted;
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
  refundCapability: string | null;
  supportsSave: boolean;
  reusablePaymentCode: boolean;
  merchantInitiatedTransaction: boolean;
  logoUrl: string | null;
  isActive: boolean;
  usage: {
    transactionCount: number;
    paidVolume: number;
    platformAccountCount: number;
    uniqueUserCount: number;
    pendingCount: number;
    lastUsedAt: Date | null;
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
  const userCountMap = new Map<string, number>();
  const pendingMap = new Map<string, number>();
  const lastUsedMap = new Map<string, Date>();

  if (channelIds.length > 0) {
    const [paidRows, userRows, pendingRows] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['paymentChannelId'],
        where: {
          paymentChannelId: { in: channelIds },
          paymentStatus: PaymentStatus.SUCCESS,
        },
        _sum: { amount: true },
      }),
      // Pemakai unik per channel: distinct (channel, user) lalu dihitung di memori.
      prisma.transaction.groupBy({
        by: ['paymentChannelId', 'userId'],
        where: { paymentChannelId: { in: channelIds } },
        _max: { createdAt: true },
      }),
      prisma.transaction.groupBy({
        by: ['paymentChannelId'],
        where: {
          paymentChannelId: { in: channelIds },
          paymentStatus: PaymentStatus.PENDING,
        },
        _count: { _all: true },
      }),
    ]);

    for (const row of paidRows) {
      if (row.paymentChannelId) {
        volumeMap.set(row.paymentChannelId, toNumber(row._sum.amount));
      }
    }
    for (const row of userRows) {
      if (!row.paymentChannelId) continue;
      userCountMap.set(row.paymentChannelId, (userCountMap.get(row.paymentChannelId) ?? 0) + 1);
      const last = row._max.createdAt;
      if (last) {
        const current = lastUsedMap.get(row.paymentChannelId);
        if (!current || last > current) lastUsedMap.set(row.paymentChannelId, last);
      }
    }
    for (const row of pendingRows) {
      if (row.paymentChannelId) {
        pendingMap.set(row.paymentChannelId, row._count._all);
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
      refundCapability: ch.refundCapability,
      supportsSave: ch.supportsSave,
      reusablePaymentCode: ch.reusablePaymentCode,
      merchantInitiatedTransaction: ch.merchantInitiatedTransaction,
      logoUrl: ch.logoUrl,
      isActive: ch.isActive,
      usage: {
        transactionCount,
        paidVolume: volumeMap.get(ch.id) ?? 0,
        platformAccountCount,
        uniqueUserCount: userCountMap.get(ch.id) ?? 0,
        pendingCount: pendingMap.get(ch.id) ?? 0,
        lastUsedAt: lastUsedMap.get(ch.id) ?? null,
      },
      canDelete: transactionCount === 0 && platformAccountCount === 0,
    };
  });
};

export type AdminPaymentChannelUsageDetail = {
  channel: {
    id: string;
    name: string;
    code: string;
    group: PaymentMethod | null;
    isActive: boolean;
  };
  totals: {
    transactionCount: number;
    successCount: number;
    pendingCount: number;
    failedCount: number;
    uniqueUserCount: number;
    orderCount: number;
    paidVolume: number;
    platformAccountCount: number;
    lastUsedAt: Date | null;
  };
  topUsers: {
    userId: string;
    fullName: string;
    email: string;
    role: string;
    transactionCount: number;
    paidVolume: number;
    lastUsedAt: Date | null;
  }[];
  recentTransactions: {
    id: string;
    amount: number;
    status: string;
    paymentStatus: string | null;
    orderNumber: string | null;
    userId: string;
    userName: string;
    userEmail: string;
    createdAt: Date;
    paidAt: Date | null;
  }[];
  platformAccounts: {
    id: string;
    accountName: string;
    branch: string | null;
    currency: string;
    isActive: boolean;
  }[];
};

/**
 * [Admin] Detail "siapa yang pakai" satu channel pembayaran — dipakai sebelum
 * ops menonaktifkan/menghapus channel supaya dampaknya kelihatan.
 */
export const getPaymentChannelUsageDetail = async (
  id: string,
): Promise<AdminPaymentChannelUsageDetail> => {
  const channel = await prisma.paymentChannel.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, group: true, isActive: true },
  });
  if (!channel) throw new AppError('Channel pembayaran tidak ditemukan', 404);

  const where: Prisma.TransactionWhereInput = { paymentChannelId: id };

  const [
    transactionCount,
    successCount,
    pendingCount,
    failedCount,
    orderCount,
    paidAggregate,
    lastTransaction,
    userGroups,
    recentRows,
    platformAccounts,
  ] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: { ...where, paymentStatus: PaymentStatus.SUCCESS } }),
    prisma.transaction.count({ where: { ...where, paymentStatus: PaymentStatus.PENDING } }),
    prisma.transaction.count({ where: { ...where, paymentStatus: PaymentStatus.FAILED } }),
    prisma.transaction.count({ where: { ...where, orderId: { not: null } } }),
    prisma.transaction.aggregate({
      where: { ...where, paymentStatus: PaymentStatus.SUCCESS },
      _sum: { amount: true },
    }),
    prisma.transaction.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.transaction.groupBy({
      by: ['userId'],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 8,
    }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        paidAt: true,
        userId: true,
        order: { select: { orderNumber: true } },
        user: { select: { fullName: true, email: true } },
      },
    }),
    prisma.platformBankAccount.findMany({
      where: { paymentChannelId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        accountName: true,
        branch: true,
        currency: true,
        isActive: true,
      },
    }),
  ]);

  const uniqueUsers = await prisma.transaction.groupBy({ by: ['userId'], where });

  const topUserIds = userGroups.map((row) => row.userId);
  const topUserRecords = topUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, fullName: true, email: true, role: true },
      })
    : [];
  const topUserMap = new Map(topUserRecords.map((u) => [u.id, u]));

  const topUserVolumes = topUserIds.length
    ? await prisma.transaction.groupBy({
        by: ['userId'],
        where: { ...where, userId: { in: topUserIds }, paymentStatus: PaymentStatus.SUCCESS },
        _sum: { amount: true },
      })
    : [];
  const volumeByUser = new Map(
    topUserVolumes.map((row) => [row.userId, toNumber(row._sum.amount)]),
  );

  return {
    channel,
    totals: {
      transactionCount,
      successCount,
      pendingCount,
      failedCount,
      uniqueUserCount: uniqueUsers.length,
      orderCount,
      paidVolume: toNumber(paidAggregate._sum.amount),
      platformAccountCount: platformAccounts.length,
      lastUsedAt: lastTransaction?.createdAt ?? null,
    },
    topUsers: userGroups.map((row) => {
      const user = topUserMap.get(row.userId);
      return {
        userId: row.userId,
        fullName: user?.fullName ?? 'Pengguna terhapus',
        email: user?.email ?? '',
        role: user?.role ?? '',
        transactionCount: row._count._all,
        paidVolume: volumeByUser.get(row.userId) ?? 0,
        lastUsedAt: row._max.createdAt ?? null,
      };
    }),
    recentTransactions: recentRows.map((tx) => ({
      id: tx.id,
      amount: toNumber(tx.amount),
      status: tx.status,
      paymentStatus: tx.paymentStatus,
      orderNumber: tx.order?.orderNumber ?? null,
      userId: tx.userId,
      userName: tx.user?.fullName ?? 'Pengguna terhapus',
      userEmail: tx.user?.email ?? '',
      createdAt: tx.createdAt,
      paidAt: tx.paidAt,
    })),
    platformAccounts,
  };
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
  refundCapability?: string | null;
  supportsSave?: boolean;
  reusablePaymentCode?: boolean;
  merchantInitiatedTransaction?: boolean;
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
      refundCapability: data.refundCapability,
      supportsSave: data.supportsSave ?? false,
      reusablePaymentCode: data.reusablePaymentCode ?? false,
      merchantInitiatedTransaction: data.merchantInitiatedTransaction ?? false,
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
    refundCapability?: string | null;
    supportsSave?: boolean;
    reusablePaymentCode?: boolean;
    merchantInitiatedTransaction?: boolean;
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
      ...(data.refundCapability !== undefined ? { refundCapability: data.refundCapability } : {}),
      ...(data.supportsSave !== undefined ? { supportsSave: data.supportsSave } : {}),
      ...(data.reusablePaymentCode !== undefined
        ? { reusablePaymentCode: data.reusablePaymentCode }
        : {}),
      ...(data.merchantInitiatedTransaction !== undefined
        ? { merchantInitiatedTransaction: data.merchantInitiatedTransaction }
        : {}),
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

export type FinanceBulkStatusPayload = {
  isActive: boolean;
  ids?: string[];
  group?: PaymentMethod;
  /** Wajib true bila tidak mengirim ids/group — mematikan semua channel sekaligus. */
  all?: boolean;
  reason?: string;
};

const assertBulkSelector = (payload: FinanceBulkStatusPayload): void => {
  if (payload.ids?.length || payload.group || payload.all) return;
  throw new AppError('Pilih minimal satu item, grup, atau centang "semua".', 400);
};

/**
 * [Admin] Aktif/nonaktif massal channel pembayaran — mis. saat gateway Xendit
 * bermasalah dan ops perlu menutup semua metode online tanpa deploy.
 */
export const bulkSetPaymentChannelStatus = async (
  adminId: string,
  payload: FinanceBulkStatusPayload,
) => {
  assertBulkSelector(payload);

  const where: Prisma.PaymentChannelWhereInput = {
    isActive: !payload.isActive,
    ...(payload.ids?.length ? { id: { in: payload.ids } } : {}),
    ...(payload.group ? { group: payload.group } : {}),
  };

  const targets = await prisma.paymentChannel.findMany({
    where,
    select: { id: true, name: true, code: true },
  });

  if (targets.length === 0) {
    return { updated: 0, isActive: payload.isActive, items: [] as typeof targets };
  }

  await prisma.paymentChannel.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isActive: payload.isActive },
  });
  await invalidatePayChannels();

  await createAuditLog({
    userId: adminId,
    action: payload.isActive ? 'BULK_ENABLE_PAYMENT_CHANNELS' : 'BULK_DISABLE_PAYMENT_CHANNELS',
    entity: 'PAYMENT_CHANNEL',
    newValue: {
      isActive: payload.isActive,
      group: payload.group ?? null,
      codes: targets.map((t) => t.code),
      ...(payload.reason?.trim() ? { reason: payload.reason.trim() } : {}),
    },
  });

  return { updated: targets.length, isActive: payload.isActive, items: targets };
};

/**
 * [Admin] Aktif/nonaktif massal bank payout (penarikan supplier).
 */
export const bulkSetPayoutBankStatus = async (
  adminId: string,
  payload: FinanceBulkStatusPayload,
) => {
  assertBulkSelector(payload);

  const where: Prisma.PayoutBankWhereInput = {
    isActive: !payload.isActive,
    ...(payload.ids?.length ? { id: { in: payload.ids } } : {}),
  };

  const targets = await prisma.payoutBank.findMany({
    where,
    select: { id: true, name: true, code: true },
  });

  if (targets.length === 0) {
    return { updated: 0, isActive: payload.isActive, items: [] as typeof targets };
  }

  await prisma.payoutBank.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isActive: payload.isActive },
  });
  await invalidatePayoutBanks();

  await createAuditLog({
    userId: adminId,
    action: payload.isActive ? 'BULK_ENABLE_PAYOUT_BANKS' : 'BULK_DISABLE_PAYOUT_BANKS',
    entity: 'PAYOUT_BANK',
    newValue: {
      isActive: payload.isActive,
      codes: targets.map((t) => t.code),
      ...(payload.reason?.trim() ? { reason: payload.reason.trim() } : {}),
    },
  });

  return { updated: targets.length, isActive: payload.isActive, items: targets };
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
