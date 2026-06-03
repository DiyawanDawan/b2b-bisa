import { Router } from 'express';
import * as notificationController from '#controllers/notification.controller';
import { requireAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as notificationValidation from '#validations/notification.validation';

const router = Router();

// Semua rute notifikasi memerlukan autentikasi
router.use(requireAuth);

/**
 * @route GET /api/v1/notifications
 */
router.get('/', notificationController.listNotifications);

/**
 * @route POST /api/v1/notifications/tokens
 * @desc Register FCM token for current user
 */
router.post(
  '/tokens',
  validate(notificationValidation.registerTokenSchema, 'all'),
  notificationController.registerToken,
);

/**
 * @route PATCH /api/v1/notifications/read-all
 */
router.patch('/read-all', notificationController.markAllAsRead);

/**
 * @route GET /api/v1/notifications/:id
 */
router.get('/:id', notificationController.getNotification);

/**
 * @route PATCH /api/v1/notifications/:id/read
 */
router.patch('/:id/read', notificationController.markAsRead);

/**
 * @route DELETE /api/v1/notifications/:id
 */
router.delete('/:id', notificationController.deleteNotification);

export default router;
