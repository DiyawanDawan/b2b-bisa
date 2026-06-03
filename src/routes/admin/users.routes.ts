import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import * as verificationController from '#controllers/verification.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

/**
 * GET /api/v1/admin/users/stats
 */
router.get('/stats', adminController.getUserAnalyticsStats);

/**
 * GET /api/v1/admin/users
 * Management user dengan filter & pagination.
 */
router.get('/', validate(adminValidation.listUsersSchema, 'query'), adminController.listUsers);

/**
 * GET /api/v1/admin/users/verifications
 * KYC Queue dengan pagination.
 * Static path harus sebelum /:id/* agar tidak tertangkap sebagai id.
 */
router.get(
  '/verifications',
  validate(adminValidation.listKYCQueueSchema, 'query'),
  adminController.getKYCQueue,
);

/**
 * PATCH /api/v1/admin/users/verifications/review
 * Approve/Reject KYC.
 */
router.patch(
  '/verifications/review',
  validate(adminValidation.updateKYCSchema),
  verificationController.updateVerificationStatus,
);

/**
 * GET /api/v1/admin/users/:id/dossier
 * Dossier 360 derajat user untuk audit.
 */
router.get('/:id/dossier', adminController.getUserDossier);

/**
 * PATCH /api/v1/admin/users/:id/status
 * Ban/Unban user.
 */
router.patch(
  '/:id/status',
  validate(adminValidation.updateUserStatusSchema),
  adminController.updateUserStatus,
);

export default router;
