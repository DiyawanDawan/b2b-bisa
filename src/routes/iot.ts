import { Router } from 'express';
import * as iotController from '#controllers/iot.controller';
import { requireAuth, requireRole, requireTierPro } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';
import validate from '#middlewares/validate';
import * as deviceValidation from '#validations/device.validation';

const router = Router();

router.use(requireAuth);

/**
 * 🔓 PUBLIC (Authenticated but not necessarily PRO)
 * For upgrading to PRO
 */
router.post(
  '/subscribe',
  requireRole(UserRole.SUPPLIER),
  validate(deviceValidation.subscriptionSchema, 'all'),
  iotController.subscribe,
);

/**
 * 🔒 PRO TIER PROTECTED (Require active subscription)
 */
router.use(requireTierPro);

// Device management
router.get(
  '/devices',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.paginationSchema, 'all'),
  iotController.listDevices,
);

router.get(
  '/status-summary',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  iotController.getDeviceStatusSummary,
);

router.post(
  '/devices',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.registerDeviceSchema, 'all'),
  iotController.registerDevice,
);

router.patch(
  '/devices/:deviceId',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.updateDeviceSchema, 'all'),
  iotController.updateDevice,
);

router.delete(
  '/devices/:deviceId',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  iotController.deleteDevice,
);

// Advanced Dashboard
router.get(
  '/dashboard/:deviceId',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  iotController.getDeviceDashboard,
);

// Telemetry & History
router.get(
  '/data/:deviceId',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.paginationSchema, 'all'),
  iotController.getDeviceHistory,
);

/**
 * 📟 Alert Management
 */
router.patch(
  '/alerts/:alertId/read',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  iotController.markAlertAsRead,
);

/**
 * 📡 Hardware Endpoint (Telemetry ingest)
 */
router.post(
  '/data',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.logReadingSchema, 'all'),
  iotController.logReading,
);

export default router;
