import { Router } from 'express';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';
import * as partnershipValidation from '#validations/partnership.validation';
import * as partialValidation from '#validations/admin-partial.validation';
import * as adminPartnershipController from '#controllers/admin-partnership.controller';
import * as partialController from '#controllers/admin-partial.controller';

const router = Router();

/**
 * GET /api/v1/admin/partnerships
 */
router.get(
  '/',
  validate(adminValidation.listAdminPartnershipsSchema, 'query'),
  adminPartnershipController.listPartnerships,
);

/**
 * GET /api/v1/admin/partnerships/:id
 */
router.get(
  '/:id',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  adminPartnershipController.getPartnership,
);

/**
 * GET /api/v1/admin/partnerships/:id/history
 */
router.get(
  '/:id/history',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  partialController.getPartnershipHistory,
);

/**
 * GET /api/v1/admin/partnerships/:id/document
 */
router.get(
  '/:id/document',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  partialController.downloadPartnershipDocument,
);

/**
 * POST /api/v1/admin/partnerships/:id/sign
 */
router.post(
  '/:id/sign',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  validate(partnershipValidation.signPartnershipSchema),
  adminPartnershipController.signAsPlatform,
);

/**
 * POST /api/v1/admin/partnerships/:id/approve
 */
router.post(
  '/:id/approve',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  validate(partialValidation.adminPartnershipDecisionSchema),
  partialController.approvePartnership,
);

/**
 * POST /api/v1/admin/partnerships/:id/reject
 */
router.post(
  '/:id/reject',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  validate(partialValidation.adminPartnershipDecisionSchema),
  partialController.rejectPartnership,
);

/**
 * POST /api/v1/admin/partnerships/:id/cancel
 */
router.post(
  '/:id/cancel',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  validate(partialValidation.adminPartnershipCancelSchema),
  partialController.cancelPartnership,
);

/**
 * PATCH /api/v1/admin/partnerships/:id/notes
 */
router.patch(
  '/:id/notes',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  validate(partialValidation.adminPartnershipNotesSchema),
  partialController.updatePartnershipNotes,
);

export default router;
