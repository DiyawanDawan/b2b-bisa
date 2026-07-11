import { Router } from 'express';
import * as iotController from '#controllers/iot.controller';
import validate from '#middlewares/validate';
import * as deviceValidation from '#validations/device.validation';

const router = Router();

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

export default router;
