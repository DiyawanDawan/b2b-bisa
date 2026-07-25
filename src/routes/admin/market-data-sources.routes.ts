import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-governance.validation';
import * as controller from '#controllers/admin-governance.controller';

const router = Router();

/** GET /api/v1/admin/market/data-sources/waste */
router.get('/waste', validate(v.adminListWasteDataSchema, 'query'), controller.listWasteData);

/** POST /api/v1/admin/market/data-sources/waste */
router.post('/waste', validate(v.adminCreateWasteDataSchema), controller.createWasteData);

/** PATCH /api/v1/admin/market/data-sources/waste/:id */
router.patch(
  '/waste/:id',
  validate(v.idParamSchema, 'params'),
  validate(v.adminUpdateWasteDataSchema),
  controller.updateWasteData,
);

/** DELETE /api/v1/admin/market/data-sources/waste/:id */
router.delete(
  '/waste/:id',
  validate(v.idParamSchema, 'params'),
  validate(v.adminDeleteWasteDataSchema),
  controller.deleteWasteData,
);

export default router;
