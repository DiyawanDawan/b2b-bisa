import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import { financialLimiter } from '#middlewares/rateLimiter';
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
 * GET /api/v1/admin/orders/disputes/:orderId/chat
 */
router.get(
  '/disputes/:orderId/chat',
  validate(adminValidation.disputeChatQuerySchema, 'query'),
  adminController.getDisputeChatThread,
);

/**
 * POST /api/v1/admin/orders/disputes/:orderId/chat/messages
 */
router.post(
  '/disputes/:orderId/chat/messages',
  validate(adminValidation.adminChatMessageSchema),
  adminController.sendDisputeMediationMessage,
);

/**
 * POST /api/v1/admin/orders/disputes/:orderId/mediation/start
 */
router.post('/disputes/:orderId/mediation/start', financialLimiter, adminController.startDisputeMediation);

/**
 * POST /api/v1/admin/orders/disputes/:orderId/mediation/ready
 */
router.post('/disputes/:orderId/mediation/ready', financialLimiter, adminController.markDisputeReadyToResolve);

/**
 * GET /api/v1/admin/orders/:id
 */
router.get('/:id', extendedController.getOrderDetail);

/**
 * POST /api/v1/admin/orders/:id/resolve
 */
router.post(
  '/:id/resolve',
  financialLimiter,
  validate(adminValidation.resolveDisputeSchema),
  adminController.resolveDispute,
);

export default router;
