import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-core.validation';
import * as controller from '#controllers/admin-core.controller';

const router = Router();

/** GET /api/v1/admin/rfqs */
router.get('/', validate(v.adminListRfqsSchema, 'query'), controller.listRfqs);

/** GET /api/v1/admin/rfqs/:id */
router.get('/:id', validate(v.idParamSchema, 'params'), controller.getRfq);

/** PATCH /api/v1/admin/rfqs/:id/status */
router.patch(
  '/:id/status',
  validate(v.idParamSchema, 'params'),
  validate(v.adminRfqStatusSchema),
  controller.updateRfqStatus,
);

/** POST /api/v1/admin/rfqs/:id/cancel */
router.post(
  '/:id/cancel',
  validate(v.idParamSchema, 'params'),
  validate(v.adminRfqCancelSchema),
  controller.cancelRfq,
);

/** POST /api/v1/admin/rfqs/:id/expire */
router.post('/:id/expire', validate(v.idParamSchema, 'params'), controller.expireRfq);

/** POST /api/v1/admin/rfqs/:id/flag */
router.post(
  '/:id/flag',
  validate(v.idParamSchema, 'params'),
  validate(v.adminRfqFlagSchema),
  controller.flagRfq,
);

export default router;
