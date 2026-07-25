import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import * as partialController from '#controllers/admin-partial.controller';
import validate from '#middlewares/validate';
import * as partialValidation from '#validations/admin-partial.validation';

const router = Router();

/** Legacy read-only trends (public-shaped) */
router.get('/trends', extendedController.getMarketTrends);

/** CRUD trends */
router.get(
  '/trends/manage',
  validate(partialValidation.adminListMarketTrendsSchema, 'query'),
  partialController.listMarketTrendsCrud,
);

router.post(
  '/trends',
  validate(partialValidation.adminMarketTrendSchema),
  partialController.createMarketTrend,
);

router.patch(
  '/trends/:id',
  validate(partialValidation.adminUpdateMarketTrendSchema),
  partialController.updateMarketTrend,
);

router.delete('/trends/:id', partialController.deleteMarketTrend);

/** Supply-demand snapshots CRUD */
router.get(
  '/supply-demand',
  validate(partialValidation.adminListSupplyDemandSchema, 'query'),
  partialController.listSupplyDemand,
);

router.post(
  '/supply-demand',
  validate(partialValidation.adminSupplyDemandSchema),
  partialController.createSupplyDemand,
);

router.patch(
  '/supply-demand/:id',
  validate(partialValidation.adminUpdateSupplyDemandSchema),
  partialController.updateSupplyDemand,
);

router.delete('/supply-demand/:id', partialController.deleteSupplyDemand);

export default router;
