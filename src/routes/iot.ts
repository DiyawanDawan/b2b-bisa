import { Router } from 'express';
import * as iotController from '#controllers/iot.controller';
import { requireAuth, requireRole, requireTierPro } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';
import validate from '#middlewares/validate';
import * as deviceValidation from '#validations/device.validation';
import { iotIngestLimiter } from '#middlewares/rateLimiter';

const router = Router();

/**
 * 📡 Hardware Endpoint (Telemetry ingest)
 * Auth via X-Device-Token only.
 */
router.post(
  '/data',
  iotIngestLimiter,
  validate(deviceValidation.logReadingSchema, 'all'),
  iotController.logReading,
);

router.use(requireAuth);

/**
 * 🔓 AUTHENTICATED (not necessarily PRO)
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

router.post(
  '/devices/claim',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.claimIotDeviceSchema, 'all'),
  iotController.claimDevice,
);

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
  validate(deviceValidation.iotDashboardQuerySchema, 'all'),
  iotController.getDeviceDashboard,
);

router.get(
  '/analytics/fleet',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotFleetQuerySchema, 'all'),
  iotController.getFleetAnalytics,
);

router.get(
  '/devices/:deviceId/alerts',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotDeviceAlertsQuerySchema, 'all'),
  iotController.getDeviceAlerts,
);

router.get(
  '/devices/:deviceId/latest',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotDeviceIdParamsSchema, 'all'),
  iotController.getDeviceLatest,
);

router.get(
  '/devices/:deviceId/readings/export',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotDashboardQuerySchema, 'all'),
  iotController.exportDeviceReadings,
);

router.get(
  '/devices/:deviceId/stream',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotDeviceIdParamsSchema, 'all'),
  iotController.streamDeviceTelemetry,
);

router.get(
  '/devices/:deviceId/pyrolysis-session',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotDeviceIdParamsSchema, 'all'),
  iotController.getPyrolysisSession,
);

router.post(
  '/devices/:deviceId/pyrolysis-session/start',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotPyrolysisSessionStartSchema, 'all'),
  iotController.startPyrolysisSession,
);

router.post(
  '/devices/:deviceId/pyrolysis-session/stop',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotDeviceIdParamsSchema, 'all'),
  iotController.stopPyrolysisSession,
);

router.post(
  '/devices/:deviceId/analyze-realtime',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(deviceValidation.iotAnalyzeRealtimeSchema, 'all'),
  iotController.analyzeDeviceRealtime,
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

export default router;
