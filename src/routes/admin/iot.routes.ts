import { Router } from 'express';
import * as iotController from '#controllers/iot.controller';
import validate from '#middlewares/validate';
import * as deviceValidation from '#validations/device.validation';

const router = Router();

/**
 * GET /api/v1/admin/iot/devices
 * Read-only fleet monitoring for admins.
 */
router.get(
  '/devices',
  validate(deviceValidation.paginationSchema, 'all'),
  iotController.listAdminIotDevices,
);

export default router;
