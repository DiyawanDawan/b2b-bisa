import { Router } from 'express';
import * as ctrl from '#controllers/bisa-express.controller';
import { requireAuth } from '#middlewares/authMiddleware';
import { requireBisaExpressDriver } from '#middlewares/bisaExpressDriver';
import validate from '#middlewares/validate';
import * as v from '#validations/bisa-express.validation';

const router = Router();

// Public / buyer
router.get(
  '/check-coverage',
  requireAuth,
  validate(v.checkCoverageSchema, 'query'),
  ctrl.checkCoverage,
);
router.get('/calculate', requireAuth, validate(v.calculateSchema, 'query'), ctrl.calculate);
router.get('/services', requireAuth, ctrl.listServices);
router.get('/track/:awb', requireAuth, validate(v.trackAwbParamsSchema, 'params'), ctrl.trackAwb);
router.get(
  '/shipment/:orderId',
  requireAuth,
  validate(v.orderIdParamsSchema, 'params'),
  ctrl.getByOrder,
);
router.get(
  '/shipment/:id/timeline',
  requireAuth,
  validate(v.shipmentIdParamsSchema, 'params'),
  ctrl.getTimeline,
);
router.get(
  '/shipment/:id/location',
  requireAuth,
  validate(v.shipmentIdParamsSchema, 'params'),
  ctrl.getLocation,
);

// Seller
router.post('/request-pickup', requireAuth, validate(v.requestPickupSchema), ctrl.requestPickup);
router.put(
  '/shipment/:id/seller-note',
  requireAuth,
  validate(v.shipmentIdParamsSchema, 'params'),
  validate(v.sellerNoteSchema),
  ctrl.updateSellerNote,
);
router.get('/my-shipments', requireAuth, ctrl.mySellerShipments);

// Driver
router.get('/driver/my-assignments', requireAuth, requireBisaExpressDriver, ctrl.driverAssignments);
router.put(
  '/driver/accept/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  ctrl.driverAccept,
);
router.put(
  '/driver/pickup/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  validate(v.driverPickupSchema),
  ctrl.driverPickup,
);
router.put(
  '/driver/arrive-hub/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  validate(v.driverHubSchema),
  ctrl.driverArriveHub,
);
router.put(
  '/driver/depart-hub/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  validate(v.driverHubSchema),
  ctrl.driverDepartHub,
);
router.put(
  '/driver/out-for-delivery/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  ctrl.driverOutForDelivery,
);
router.put(
  '/driver/deliver/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  validate(v.driverDeliverSchema),
  ctrl.driverDeliver,
);
router.put(
  '/driver/fail/:shipmentId',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.shipmentIdAltParamsSchema, 'params'),
  validate(v.driverFailSchema),
  ctrl.driverFail,
);
router.post(
  '/driver/location',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.driverLocationSchema),
  ctrl.driverLocation,
);
router.put(
  '/driver/status',
  requireAuth,
  requireBisaExpressDriver,
  validate(v.driverStatusSchema),
  ctrl.driverStatus,
);
router.get('/driver/stats', requireAuth, requireBisaExpressDriver, ctrl.driverStats);

export default router;
