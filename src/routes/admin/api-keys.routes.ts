import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-governance.validation';
import * as controller from '#controllers/admin-governance.controller';

const router = Router();

/** GET /api/v1/admin/integrations/api-keys */
router.get('/', validate(v.adminListApiKeysSchema, 'query'), controller.listApiKeys);

/** POST /api/v1/admin/integrations/api-keys — plaintext hanya di respons ini */
router.post('/', validate(v.adminCreateApiKeySchema), controller.createApiKey);

/** POST /api/v1/admin/integrations/api-keys/:id/revoke */
router.post(
  '/:id/revoke',
  validate(v.idParamSchema, 'params'),
  validate(v.adminRevokeApiKeySchema),
  controller.revokeApiKey,
);

/** POST /api/v1/admin/integrations/api-keys/:id/rotate */
router.post(
  '/:id/rotate',
  validate(v.idParamSchema, 'params'),
  validate(v.adminRotateApiKeySchema),
  controller.rotateApiKey,
);

export default router;
