import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-governance.validation';
import * as controller from '#controllers/admin-governance.controller';

const router = Router();

/** GET /api/v1/admin/finance/platform-accounts */
router.get(
  '/',
  validate(v.adminListPlatformAccountsSchema, 'query'),
  controller.listPlatformAccounts,
);

/** POST /api/v1/admin/finance/platform-accounts */
router.post('/', validate(v.adminCreatePlatformAccountSchema), controller.createPlatformAccount);

/** PATCH /api/v1/admin/finance/platform-accounts/:id */
router.patch(
  '/:id',
  validate(v.idParamSchema, 'params'),
  validate(v.adminUpdatePlatformAccountSchema),
  controller.updatePlatformAccount,
);

/** GET /api/v1/admin/finance/platform-accounts/:id/audit */
router.get('/:id/audit', validate(v.idParamSchema, 'params'), controller.getPlatformAccountAudit);

export default router;
