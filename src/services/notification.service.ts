import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { NotificationType, NotificationPriority } from '#prisma';

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
  return prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      body: data.body,
      type: data.type,
      priority: data.priority || NotificationPriority.MEDIUM,
      refId: data.refId,
    },
  });
};

export const listNotifications = async (
  userId: string,
  page = 1,
  limit = 20,
  unreadOnly = false,
) => {
  const skip = (page - 1) * limit;
  const where: any = { userId };
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
