import { Response } from 'express';
import * as notificationService from '#services/notification.service';
import { successResponse, paginatedResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import { AuthRequest } from '#middlewares/authMiddleware';

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
 * DELETE /api/v1/notifications/:id
 */
export const deleteNotification = catchAsync(async (req: AuthRequest, res: Response) => {
  await notificationService.deleteNotification(req.params.id, req.user!.id);
  return successResponse(res, null, 'Notifikasi berhasil dihapus');
});
