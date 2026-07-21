import { Router } from 'express';
import * as marketController from '#controllers/market.controller';
import { optionalAuth, requireAuth, requireRole } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';

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
  validate(marketValidation.getPredictionSchema, 'params'),
  marketController.getPrediction,
);

// Analitik pasar & prediksi AI tersedia untuk semua user login.
// Langganan PRO hanya untuk IoT (lihat routes/iot.ts).
router.get('/supply-demand', requireAuth, marketController.getSupplyDemand);

router.post('/sync', requireAuth, requireRole(UserRole.ADMIN), marketController.syncMarketData);

export default router;
