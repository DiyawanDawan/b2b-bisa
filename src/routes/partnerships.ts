import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as partnershipController from '#controllers/partnership.controller';
import * as v from '#validations/partnership.validation';
import { UserRole } from '#prisma';

const router = Router();

router.get(
  '/verify/:contractNumber',
  validate(v.verifyContractParamSchema, 'params'),
  partnershipController.verifyContract,
);

router.use(requireAuth);

router.post(
  '/',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createPartnershipSchema),
  partnershipController.createPartnership,
);

router.get(
  '/',
  validate(v.listPartnershipsQuerySchema, 'query'),
  partnershipController.listMyPartnerships,
);

router.get(
  '/check/:supplierId',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.checkSupplierParamSchema, 'params'),
  partnershipController.checkWithSupplier,
);

router.get(
  '/:id',
  validate(v.partnershipIdParamSchema, 'params'),
  partnershipController.getPartnershipById,
);

router.put(
  '/:id/accept',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.partnershipIdParamSchema, 'params'),
  partnershipController.acceptPartnership,
);

router.put(
  '/:id/reject',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.partnershipIdParamSchema, 'params'),
  validate(v.rejectPartnershipSchema),
  partnershipController.rejectPartnership,
);

router.put(
  '/:id/sign',
  validate(v.partnershipIdParamSchema, 'params'),
  validate(v.signPartnershipSchema),
  partnershipController.signPartnership,
);

router.put(
  '/:id/terminate',
  validate(v.partnershipIdParamSchema, 'params'),
  validate(v.terminatePartnershipSchema),
  partnershipController.terminatePartnership,
);

router.put(
  '/:id/renew',
  validate(v.partnershipIdParamSchema, 'params'),
  validate(v.renewPartnershipSchema),
  partnershipController.requestRenewal,
);

router.put(
  '/:id/renew/accept',
  validate(v.partnershipIdParamSchema, 'params'),
  partnershipController.acceptRenewal,
);

router.put(
  '/:id/renew/reject',
  validate(v.partnershipIdParamSchema, 'params'),
  validate(v.rejectRenewalSchema),
  partnershipController.rejectRenewal,
);

export default router;
