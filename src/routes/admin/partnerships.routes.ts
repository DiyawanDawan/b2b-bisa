import { Router } from 'express';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';
import * as partnershipValidation from '#validations/partnership.validation';
import * as adminPartnershipController from '#controllers/admin-partnership.controller';

const router = Router();

/**
 * GET /api/v1/admin/partnerships
 * Daftar kontrak kerjasama (draf, menunggu TTD, aktif, dll.)
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
 * POST /api/v1/admin/partnerships/:id/sign
 * Tanda tangan penengah BISA (setelah buyer + supplier TTD)
 */
router.post(
  '/:id/sign',
  validate(partnershipValidation.partnershipIdParamSchema, 'params'),
  validate(partnershipValidation.signPartnershipSchema),
  adminPartnershipController.signAsPlatform,
);

export default router;
