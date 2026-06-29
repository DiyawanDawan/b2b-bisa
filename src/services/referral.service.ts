import crypto from 'crypto';
import { Prisma } from '#prisma';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { ReferralRewardStatus } from '#prisma';

export const REFERRAL_COMMISSION_IDR = 25_000;

const buildReferralCode = (userId: string) => {
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `BISA-${userId.replace(/-/g, '').slice(0, 6).toUpperCase()}${suffix}`;
};

export const ensureReferralCode = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) throw new AppError('User tidak ditemukan.', 404);
  if (user.referralCode) return user.referralCode;

  for (let i = 0; i < 5; i++) {
    const code = buildReferralCode(userId);
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return code;
    } catch {
      // collision — retry
    }
  }
  throw new AppError('Gagal membuat kode referral.', 500);
};

export const validateReferralCode = async (code: string) => {
  const referrer = await prisma.user.findFirst({
    where: { referralCode: code.toUpperCase(), status: 'ACTIVE' },
    select: { id: true, fullName: true, referralCode: true },
  });
  if (!referrer) return { valid: false };
  return {
    valid: true,
    referrerId: referrer.id,
    referrerName: referrer.fullName,
    code: referrer.referralCode,
  };
};

export const applyReferralOnRegister = async (newUserId: string, code?: string) => {
  if (!code?.trim()) return null;
  const validation = await validateReferralCode(code.trim());
  if (!validation.valid || !validation.referrerId) return null;
  if (validation.referrerId === newUserId) return null;

  await prisma.user.update({
    where: { id: newUserId },
    data: { referredById: validation.referrerId },
  });

  await prisma.referralReward.upsert({
    where: { referredUserId: newUserId },
    create: {
      referrerId: validation.referrerId,
      referredUserId: newUserId,
      amount: new Prisma.Decimal(REFERRAL_COMMISSION_IDR),
      status: ReferralRewardStatus.PENDING,
    },
    update: {},
  });

  return validation;
};

export const getReferralDashboard = async (userId: string) => {
  const code = await ensureReferralCode(userId);

  const [referrals, rewards] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.referralReward.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        creditedAt: true,
        referredUser: { select: { fullName: true } },
        order: { select: { orderNumber: true } },
      },
    }),
  ]);

  const credited = rewards.filter((r) => r.status === ReferralRewardStatus.CREDITED);
  const pending = rewards.filter((r) => r.status === ReferralRewardStatus.PENDING);
  const totalEarned = credited.reduce((sum, r) => sum + Number(r.amount), 0);

  return {
    referralCode: code,
    totalReferrals: referrals,
    totalEarned,
    pendingCount: pending.length,
    commissionPerOrder: REFERRAL_COMMISSION_IDR,
    rewards,
  };
};

/** Dipanggil saat order pertama referred user berhasil dibayar. */
export const creditReferralOnFirstPaidOrder = async (orderId: string, buyerId: string) => {
  const reward = await prisma.referralReward.findUnique({
    where: { referredUserId: buyerId },
    select: { id: true, referrerId: true, status: true, orderId: true, amount: true },
  });
  if (!reward || reward.status !== ReferralRewardStatus.PENDING) return;
  if (reward.orderId) return;

  await prisma.$transaction(async (tx) => {
    await tx.referralReward.update({
      where: { id: reward.id },
      data: {
        orderId,
        status: ReferralRewardStatus.CREDITED,
        creditedAt: new Date(),
      },
    });

    await tx.wallet.upsert({
      where: { userId: reward.referrerId },
      create: { userId: reward.referrerId, balance: reward.amount },
      update: { balance: { increment: reward.amount } },
    });
  });
};
