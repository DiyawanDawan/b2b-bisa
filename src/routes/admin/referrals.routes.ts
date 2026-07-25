import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-core.validation';
import * as controller from '#controllers/admin-core.controller';

const router = Router();

/** GET /api/v1/admin/referrals */
router.get('/', validate(v.adminListReferralsSchema, 'query'), controller.listReferrals);

/** GET /api/v1/admin/referrals/:id */
router.get('/:id', validate(v.idParamSchema, 'params'), controller.getReferral);

/** POST /api/v1/admin/referrals/:id/approve */
router.post(
  '/:id/approve',
  validate(v.idParamSchema, 'params'),
  validate(v.adminReferralDecisionSchema),
  controller.approveReferral,
);

/** POST /api/v1/admin/referrals/:id/reject */
router.post(
  '/:id/reject',
  validate(v.idParamSchema, 'params'),
  validate(v.adminReferralDecisionSchema),
  controller.rejectReferral,
);

/** POST /api/v1/admin/referrals/:id/revoke */
router.post(
  '/:id/revoke',
  validate(v.idParamSchema, 'params'),
  validate(v.adminReferralDecisionSchema),
  controller.revokeReferral,
);

export default router;
