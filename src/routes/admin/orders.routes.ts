import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

/**
 * GET /api/v1/admin/orders/disputes
 */
router.get('/disputes', adminController.listDisputes);

/**
 * GET /api/v1/admin/orders/disputes/:id
 */
router.get('/disputes/:id', adminController.getDisputeDetail);

/**
 * POST /api/v1/admin/orders/:id/resolve
 */
router.post(
  '/:id/resolve',
  validate(adminValidation.resolveDisputeSchema),
  adminController.resolveDispute,
);

export default router;
