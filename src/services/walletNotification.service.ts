import prisma from '#config/prisma';
import { NotificationPriority, NotificationType, Prisma, UserRole, UserStatus } from '#prisma';
import { createNotification } from '#services/notification.service';

const formatIdr = (amount: number | Prisma.Decimal | string) =>
  `Rp ${Number(amount).toLocaleString('id-ID')}`;

export const notifyWithdrawalSuccess = (params: {
  userId: string;
  transactionId: string;
  amount: number | Prisma.Decimal | string;
}) => {
  const { userId, transactionId, amount } = params;
  void createNotification({
    userId,
    title: 'Penarikan berhasil',
    body: `Dana ${formatIdr(amount)} telah dikirim ke rekening Anda.`,
    type: NotificationType.WITHDRAWAL_SUCCESS,
    priority: NotificationPriority.MEDIUM,
    refId: transactionId,
  }).catch(() => {});
};

export const notifyWithdrawalFailed = (params: {
  userId: string;
  transactionId: string;
  amount: number | Prisma.Decimal | string;
  reason?: string | null;
}) => {
  const { userId, transactionId, amount, reason } = params;
  const reasonText = reason?.trim() || 'Terjadi kesalahan saat memproses penarikan.';
  void createNotification({
    userId,
    title: 'Penarikan gagal',
    body: `Penarikan ${formatIdr(amount)} gagal. ${reasonText} Dana telah dikembalikan ke dompet Anda.`,
    type: NotificationType.WITHDRAWAL_FAILED,
    priority: NotificationPriority.HIGH,
    refId: transactionId,
  }).catch(() => {});
};

export const notifyAdminsWithdrawalFailed = async (params: {
  userId: string;
  transactionId: string;
  amount: number | Prisma.Decimal | string;
  reason?: string | null;
}) => {
  const { userId, transactionId, amount, reason } = params;
  const reasonText = reason?.trim() || 'Alasan tidak tersedia';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, fullName: true },
  });
  const who = user?.email || user?.fullName || userId;

  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    select: { id: true },
    take: 10,
  });

  for (const admin of admins) {
    if (admin.id === userId) continue;
    void createNotification({
      userId: admin.id,
      title: 'Penarikan gagal',
      body: `Penarikan gagal — ${who} ${formatIdr(amount)} — ${reasonText}`,
      type: NotificationType.ADMIN_WITHDRAWAL_FAILED,
      priority: NotificationPriority.HIGH,
      refId: transactionId,
    }).catch(() => {});
  }
};

export const notifyWithdrawalOutcome = async (params: {
  userId: string;
  transactionId: string;
  amount: number | Prisma.Decimal | string;
  outcome: 'SUCCESS' | 'FAILED';
  reason?: string | null;
  /** When true (default for FAILED), also alert ACTIVE admins. Skip for manual admin reject. */
  notifyAdmins?: boolean;
}) => {
  const { userId, transactionId, amount, outcome, reason, notifyAdmins = true } = params;

  if (outcome === 'SUCCESS') {
    notifyWithdrawalSuccess({ userId, transactionId, amount });
    return;
  }

  notifyWithdrawalFailed({ userId, transactionId, amount, reason });
  if (notifyAdmins) {
    await notifyAdminsWithdrawalFailed({ userId, transactionId, amount, reason });
  }
};
