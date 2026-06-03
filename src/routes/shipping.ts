import { Router } from 'express';
import * as shippingController from '#controllers/shipping.controller';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as v from '#validations/shipping.validation';
import { UserRole } from '#types/index';

const router = Router();

/**
 * Logistik pengiriman — proxy RajaOngkir Shipping Cost API (Komerce).
 * Docs: https://rajaongkir.com/docs
 */
router.get(
  '/destinations',
  requireAuth,
  validate(v.searchDestinationSchema, 'query'),
  shippingController.searchDestinations,
);

router.post(
  '/calculate-domestic',
  requireAuth,
  validate(v.calculateDomesticCostSchema),
  shippingController.calculateDomestic,
);

router.post(
  '/track',
  requireAuth,
  validate(v.trackWaybillSchema),
  shippingController.trackShipment,
);

router.get('/origin', requireAuth, shippingController.getShippingOrigin);

router.put(
  '/origin',
  requireAuth,
  validate(v.setShippingOriginSchema),
  shippingController.setShippingOrigin,
);

router.get('/pickup/vehicles', requireAuth, shippingController.getPickupVehicles);

router.put(
  '/pickup/vehicles',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate(v.setPickupVehicleOptionsSchema),
  shippingController.setPickupVehicles,
);

router.post(
  '/pickup/request',
  requireAuth,
  validate(v.requestPickupSchema),
  shippingController.requestPickup,
);

router.get('/couriers', requireAuth, shippingController.getActiveCouriers);

router.put(
  '/couriers',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate(v.setActiveCouriersSchema),
  shippingController.setActiveCouriers,
);

export default router;
