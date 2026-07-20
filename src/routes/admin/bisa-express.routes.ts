import { Router } from 'express';
import * as ctrl from '#controllers/bisa-express.controller';
import validate from '#middlewares/validate';
import * as v from '#validations/bisa-express.validation';

const router = Router();

router.get('/drivers', ctrl.adminListDrivers);
router.post('/drivers', validate(v.adminCreateDriverSchema), ctrl.adminCreateDriver);
router.put('/drivers/:id', validate(v.adminUpdateDriverSchema), ctrl.adminUpdateDriver);
router.put('/drivers/:id/suspend', ctrl.adminSuspendDriver);

router.get('/hubs', ctrl.adminListHubs);
router.post('/hubs', validate(v.adminCreateHubSchema), ctrl.adminCreateHub);
router.put('/hubs/:id', validate(v.adminUpdateHubSchema), ctrl.adminUpdateHub);
router.delete('/hubs/:id', ctrl.adminDeleteHub);

router.get('/rates', ctrl.adminListRates);
router.post('/rates', validate(v.adminCreateRateSchema), ctrl.adminCreateRate);
router.put('/rates/:id', validate(v.adminUpdateRateSchema), ctrl.adminUpdateRate);
router.delete('/rates/:id', ctrl.adminDeleteRate);

router.get('/service-rules', ctrl.adminListServiceRules);
router.post(
  '/service-rules',
  validate(v.adminUpsertServiceRuleSchema),
  ctrl.adminUpsertServiceRule,
);
router.put(
  '/service-rules/:id',
  validate(v.adminUpdateServiceRuleSchema),
  ctrl.adminUpdateServiceRule,
);
router.delete('/service-rules/:id', ctrl.adminDeleteServiceRule);

router.get('/coverage', ctrl.adminListCoverage);
router.post('/coverage', validate(v.adminCreateCoverageSchema), ctrl.adminCreateCoverage);
router.put('/coverage/:id', ctrl.adminUpdateCoverage);

router.get('/shipments', validate(v.listShipmentsQuerySchema, 'query'), ctrl.adminListShipments);
router.put('/shipments/:id/assign', validate(v.adminAssignSchema), ctrl.adminAssign);
router.put(
  '/shipments/:id/override-status',
  validate(v.adminOverrideStatusSchema),
  ctrl.adminOverrideStatus,
);

router.get('/dashboard', ctrl.adminDashboard);
router.get('/live-map', ctrl.adminLiveMap);
router.get('/reports', ctrl.adminReports);

export default router;
