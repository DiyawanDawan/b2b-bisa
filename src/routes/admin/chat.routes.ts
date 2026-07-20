import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

/**
 * GET /api/v1/admin/chat/stats
 */
router.get('/stats', extendedController.getChatStats);

/**
 * GET /api/v1/admin/chat
 */
router.get(
  '/',
  validate(adminValidation.listChatInboxSchema, 'query'),
  extendedController.listChatInbox,
);

/**
 * GET /api/v1/admin/chat/:negotiationId
 */
router.get(
  '/:negotiationId',
  validate(adminValidation.getChatThreadQuerySchema, 'query'),
  extendedController.getChatThread,
);

/**
 * POST /api/v1/admin/chat/:negotiationId/messages
 */
router.post(
  '/:negotiationId/messages',
  validate(adminValidation.adminChatMessageSchema),
  extendedController.sendAdminChatMessage,
);

export default router;
