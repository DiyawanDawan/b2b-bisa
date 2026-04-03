import { Router } from 'express';
import * as notificationController from '#controllers/notification.controller';
import { requireAuth } from '#middlewares/authMiddleware';

const router = Router();

// Semua rute notifikasi memerlukan autentikasi
router.use(requireAuth);

/**
 * @route GET /api/v1/notifications
 */
router.get('/', notificationController.listNotifications);

/**
 * @route PATCH /api/v1/notifications/:id/read
 */
router.patch('/:id/read', notificationController.markAsRead);

/**
 * @route PATCH /api/v1/notifications/read-all
 */
router.patch('/read-all', notificationController.markAllAsRead);

/**
 * @route DELETE /api/v1/notifications/:id
 */
router.delete('/:id', notificationController.deleteNotification);

export default router;
