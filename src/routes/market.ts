import { Router } from 'express';
import * as marketController from '#controllers/market.controller';
import { requireAuth } from '#middlewares/authMiddleware';

import validate from '#middlewares/validate';
import * as marketValidation from '#validations/market.validation';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validate(marketValidation.getTrendsSchema, 'query'),
  marketController.getMarketTrends,
);
router.get(
  '/prediction/:id',
  validate(marketValidation.getPredictionSchema, 'params'),
  marketController.getPrediction,
);

export default router;
