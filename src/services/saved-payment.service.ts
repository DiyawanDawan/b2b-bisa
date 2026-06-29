import prisma from '#config/prisma';
import AppError from '#utils/appError';

type ChannelInfo = {
  code: string;
  name: string;
  group: string;
};

/** FB-11 PCI: hanya metadata channel — tidak pernah PAN/CVV/token kartu. */
const savedPaymentPublicSelect = {
  id: true,
  channelCode: true,
  channelName: true,
  channelGroup: true,
  isDefault: true,
  lastUsedAt: true,
} as const;

export const listSavedPayments = async (userId: string) => {
  return prisma.userSavedPayment.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
    select: savedPaymentPublicSelect,
  });
};

export const getDefaultSavedPayment = async (userId: string) => {
  return prisma.userSavedPayment.findFirst({
    where: { userId, isDefault: true },
    orderBy: { lastUsedAt: 'desc' },
    select: savedPaymentPublicSelect,
  });
};

export const saveUserPaymentPreference = async (
  userId: string,
  channel: ChannelInfo,
) => {
  const code = channel.code.toUpperCase();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.userSavedPayment.findUnique({
      where: { userId_channelCode: { userId, channelCode: code } },
    });
    if (existing) {
      await tx.userSavedPayment.update({
        where: { id: existing.id },
        data: {
          channelName: channel.name,
          channelGroup: channel.group,
          lastUsedAt: new Date(),
        },
      });
      return;
    }
    const count = await tx.userSavedPayment.count({ where: { userId } });
    await tx.userSavedPayment.create({
      data: {
        userId,
        channelCode: code,
        channelName: channel.name,
        channelGroup: channel.group,
        isDefault: count === 0,
        lastUsedAt: new Date(),
      },
    });
  });
};

export const setDefaultSavedPayment = async (userId: string, id: string) => {
  const row = await prisma.userSavedPayment.findFirst({
    where: { id, userId },
  });
  if (!row) throw new AppError('Metode pembayaran tersimpan tidak ditemukan.', 404);

  await prisma.$transaction([
    prisma.userSavedPayment.updateMany({
      where: { userId },
      data: { isDefault: false },
    }),
    prisma.userSavedPayment.update({
      where: { id },
      data: { isDefault: true, lastUsedAt: new Date() },
    }),
  ]);
  return prisma.userSavedPayment.findUnique({
    where: { id },
    select: savedPaymentPublicSelect,
  });
};

export const deleteSavedPayment = async (userId: string, id: string) => {
  const row = await prisma.userSavedPayment.findFirst({
    where: { id, userId },
  });
  if (!row) throw new AppError('Metode pembayaran tersimpan tidak ditemukan.', 404);

  await prisma.userSavedPayment.delete({ where: { id } });

  if (row.isDefault) {
    const next = await prisma.userSavedPayment.findFirst({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
    if (next) {
      await prisma.userSavedPayment.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }
};
