import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { NotificationType, NotificationPriority, DevicePlatform } from '#prisma';
import { messaging } from '#config/firebase';
import logger from '#config/logger';

/**
 * Register or update FCM token for a user.
 * Security: Token milik user lain dihapus terlebih dahulu untuk mencegah hijacking.
 */
export const registerFCMToken = async (
  userId: string,
  fcmToken: string,
  platform: DevicePlatform = DevicePlatform.WEB,
) => {
  // Hapus token dari user lain (1 token hanya boleh dimiliki 1 user)
  await prisma.userDevice.deleteMany({
    where: { fcmToken, NOT: { userId } },
  });

  return prisma.userDevice.upsert({
    where: { fcmToken },
    update: {
      platform,
      isActive: true,
    },
    create: {
      userId,
      fcmToken,
      platform,
    },
  });
};

/**
 * Internal helper to send push notifications to a user's devices.
 * Gracefully skips if Firebase messaging is not initialized.
 */
export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) => {
  if (!messaging) {
    logger.warn('FCM: messaging not initialized, skipping push notification.');
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { enableNotifications: true },
    });
    if (user && !user.enableNotifications) return;

    const devices = await prisma.userDevice.findMany({
      where: { userId, isActive: true },
      select: { fcmToken: true },
    });

    if (devices.length === 0) return;

    const tokens: string[] = devices.map((d: { fcmToken: string }) => d.fcmToken);

    const response = await messaging.sendEachForMulticast({
      notification: { title, body },
      data: data || {},
      tokens,
    });

    logger.info(`FCM: Sent ${response.successCount} messages, ${response.failureCount} failed.`);

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx: number) => {
        if (!resp.success) {
          logger.warn(`FCM: Failed for token ${tokens[idx]}: ${resp.error?.message}`);
        }
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('FCM: Error sending push notification:', msg);
  }
};

/**
 * Create and send a new notification to a user
 */
export const createNotification = async (data: {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  priority?: NotificationPriority;
  refId?: string;
}) => {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      body: data.body,
      type: data.type,
      priority: data.priority || NotificationPriority.MEDIUM,
      refId: data.refId,
    },
  });

  // Trigger push notification asynchrously
  sendPushNotification(data.userId, data.title, data.body, {
    notificationId: notification.id,
    type: data.type,
    refId: data.refId || '',
    title: data.title,
    body: data.body,
  });

  return notification;
};

export const listNotifications = async (
  userId: string,
  page = 1,
  limit = 20,
  unreadOnly = false,
) => {
  const skip = (page - 1) * limit;
  const where: Record<string, any> = { userId };
  if (unreadOnly) where.isRead = false;

  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total };
};

export const getNotificationById = async (id: string, userId: string) => {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!notification) throw new AppError('Notifikasi tidak ditemukan.', 404);
  return notification;
};

export const markAsRead = async (id: string, userId: string) => {
  const existing = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError('Notifikasi tidak ditemukan.', 404);

  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
};

export const deleteNotification = async (id: string, userId: string) => {
  const existing = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new AppError('Notifikasi tidak ditemukan.', 404);

  return prisma.notification.delete({
    where: { id },
  });
};

export const markAllAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};
