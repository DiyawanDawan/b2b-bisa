import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

/**
 * GET /api/v1/admin/orders/stats
 */
router.get('/stats', extendedController.getOrderAnalytics);

/**
 * GET /api/v1/admin/orders/integration-health
 */
router.get('/integration-health', extendedController.getIntegrationHealth);

/**
 * GET /api/v1/admin/orders
 */
router.get('/', validate(adminValidation.listOrdersSchema, 'query'), extendedController.listOrders);

/**
 * GET /api/v1/admin/orders/disputes
 */
router.get(
  '/disputes',
  validate(adminValidation.listDisputesSchema, 'query'),
  adminController.listDisputes,
);

/**
 * GET /api/v1/admin/orders/disputes/:id
 */
router.get('/disputes/:id', adminController.getDisputeDetail);

/**
 * GET /api/v1/admin/orders/:id
 */
router.get('/:id', extendedController.getOrderDetail);

/**
 * POST /api/v1/admin/orders/:id/resolve
 */
router.post(
  '/:id/resolve',
  validate(adminValidation.resolveDisputeSchema),
  adminController.resolveDispute,
);

export default router;
