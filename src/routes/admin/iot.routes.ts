import { Router } from 'express';
import * as iotController from '#controllers/iot.controller';
import validate from '#middlewares/validate';
import * as deviceValidation from '#validations/device.validation';
import { requireAuth } from '#middlewares/authMiddleware';
import { isAdmin } from '#middlewares/isAdmin';

const router = Router();

/**
 * Double-layer Security Guard:
 * Semua route admin di bawah /api/v1/admin/iot/* wajib terautentikasi (JWT) & terotorisasi (Role ADMIN).
 * (Disamping terlindung oleh adminAccessMiddleware di routes/admin/index.ts).
 */
router.use(requireAuth, isAdmin);

/**
 * POST /api/v1/admin/iot/devices
 * Provision device + generate secret + return QR payload.
 */
router.post(
  '/devices',
  validate(deviceValidation.adminCreateIotDeviceSchema, 'all'),
  iotController.createAdminIotDevice,
);

/**
 * GET /api/v1/admin/iot/devices
 * Fleet monitoring for admins, including unclaimed inventory.
 */
router.get(
  '/devices',
  validate(deviceValidation.paginationSchema, 'all'),
  iotController.listAdminIotDevices,
);

/**
 * PATCH /api/v1/admin/iot/devices/:deviceId
 * Update device name and thresholds (admin override).
 */
router.patch(
  '/devices/:deviceId',
  validate(deviceValidation.adminUpdateDeviceSchema, 'all'),
  iotController.adminUpdateDevice,
);

/**
 * DELETE /api/v1/admin/iot/devices/:deviceId
 * Delete device permanently (admin only).
 */
router.delete('/devices/:deviceId', iotController.adminDeleteDevice);

/**
 * Subscription Plans Admin CRUD
 */
router.get('/plans', iotController.adminListSubscriptionPlans);
router.post('/plans', iotController.adminCreateSubscriptionPlan);
router.patch('/plans/:id', iotController.adminUpdateSubscriptionPlan);
router.delete('/plans/:id', iotController.adminDeleteSubscriptionPlan);

/**
 * Subscription Durations & Discounts Admin CRUD
 */
router.get('/durations', iotController.adminListSubscriptionDurations);
router.post('/durations', iotController.adminCreateSubscriptionDuration);
router.patch('/durations/:id', iotController.adminUpdateSubscriptionDuration);
router.delete('/durations/:id', iotController.adminDeleteSubscriptionDuration);

export default router;
