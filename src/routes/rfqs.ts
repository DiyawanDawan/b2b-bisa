import { Router } from 'express';
import * as rfqController from '#controllers/rfq.controller';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as v from '#validations/rfq.validation';
import { UserRole } from '#prisma';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createRfqSchema),
  rfqController.createRfq,
);
router.get('/', requireAuth, requireRole(UserRole.BUYER, UserRole.ADMIN), rfqController.listMyRfqs);
router.get(
  '/inbox',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  rfqController.listInbox,
);
router.post(
  '/:id/respond',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.rfqIdParamSchema, 'params'),
  validate(v.respondRfqSchema),
  rfqController.respond,
);

export default router;
