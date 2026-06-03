import { Response } from 'express';
import * as notificationService from '#services/notification.service';
import { successResponse, paginatedResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import { AuthRequest } from '#types/index';

/**
 * GET /api/v1/notifications
 */
export const listNotifications = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const unreadOnly = req.query.unreadOnly === 'true';

  const { notifications, total } = await notificationService.listNotifications(
    req.user!.id,
    page,
    limit,
    unreadOnly,
  );

  return paginatedResponse(
    res,
    notifications,
    total,
    page,
    limit,
    'Daftar notifikasi berhasil diambil',
  );
});

/**
 * GET /api/v1/notifications/:id
 */
export const getNotification = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await notificationService.getNotificationById(req.params.id, req.user!.id);
  return successResponse(res, data, 'Detail notifikasi berhasil diambil');
});

/**
 * PATCH /api/v1/notifications/:id/read
 */
export const markAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await notificationService.markAsRead(req.params.id, req.user!.id);
  return successResponse(res, data, 'Notifikasi berhasil ditandai dibaca');
});

/**
 * PATCH /api/v1/notifications/read-all
 */
export const markAllAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
  await notificationService.markAllAsRead(req.user!.id);
  return successResponse(res, null, 'Semua notifikasi ditandai dibaca');
});

/**
 * POST /api/v1/notifications/tokens
 */
export const registerToken = catchAsync(async (req: AuthRequest, res: Response) => {
  const { fcmToken, platform } = req.body;
  const data = await notificationService.registerFCMToken(req.user!.id, fcmToken, platform);
  return successResponse(res, data, 'Token FCM berhasil didaftarkan');
});

/**
 * DELETE /api/v1/notifications/:id
 */
export const deleteNotification = catchAsync(async (req: AuthRequest, res: Response) => {
  await notificationService.deleteNotification(req.params.id, req.user!.id);
  return successResponse(res, null, 'Notifikasi berhasil dihapus');
});
