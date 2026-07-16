import { Router } from 'express';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import { UserRole } from '#prisma';
import * as c from '#controllers/product-harvest.controller';
import * as v from '#validations/product-harvest.validation';

const router = Router();

router.get(
  '/product/:productId',
  requireAuth,
  validate(v.productIdParamSchema, 'params'),
  c.listByProduct,
);

router.post(
  '/product/:productId',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.productIdParamSchema, 'params'),
  validate(v.createHarvestLotSchema),
  c.create,
);

router.put(
  '/:lotId',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.lotIdParamSchema, 'params'),
  validate(v.updateHarvestLotSchema),
  c.update,
);

router.put(
  '/:lotId/confirm-harvest',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.lotIdParamSchema, 'params'),
  validate(v.confirmHarvestLotSchema),
  c.confirmHarvest,
);

router.put(
  '/:lotId/stock-in',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.lotIdParamSchema, 'params'),
  c.stockIn,
);

router.put(
  '/:lotId/cancel',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.lotIdParamSchema, 'params'),
  validate(v.cancelHarvestLotSchema),
  c.cancel,
);

export default router;

