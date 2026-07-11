import { Router } from 'express';
import * as marketController from '#controllers/market.controller';
import { optionalAuth, requireAuth, requireTierPro } from '#middlewares/authMiddleware';

import validate from '#middlewares/validate';
import * as marketValidation from '#validations/market.validation';

const router = Router();

router.get(
  '/trends',
  optionalAuth,
  validate(marketValidation.getTrendsSchema, 'query'),
  marketController.getMarketTrends,
);
router.get(
  '/prediction/:id',
  requireAuth,
  requireTierPro,
  validate(marketValidation.getPredictionSchema, 'params'),
  marketController.getPrediction,
);

router.get('/supply-demand', requireAuth, requireTierPro, marketController.getSupplyDemand);

router.post('/sync', requireAuth, requireTierPro, marketController.syncMarketData);

export default router;
