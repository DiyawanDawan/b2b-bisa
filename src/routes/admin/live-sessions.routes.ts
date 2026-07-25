import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-core.validation';
import * as controller from '#controllers/admin-core.controller';

const router = Router();

/** GET /api/v1/admin/live-sessions */
router.get('/', validate(v.adminListLiveSessionsSchema, 'query'), controller.listLiveSessions);

/** GET /api/v1/admin/live-sessions/:id */
router.get('/:id', validate(v.idParamSchema, 'params'), controller.getLiveSession);

/** PATCH /api/v1/admin/live-sessions/:id/status */
router.patch(
  '/:id/status',
  validate(v.idParamSchema, 'params'),
  validate(v.adminLiveStatusSchema),
  controller.updateLiveStatus,
);

/** POST /api/v1/admin/live-sessions/:id/terminate */
router.post(
  '/:id/terminate',
  validate(v.idParamSchema, 'params'),
  validate(v.adminLiveTerminateSchema),
  controller.terminateLiveSession,
);

/** PATCH /api/v1/admin/live-sessions/:id/pinned-products */
router.patch(
  '/:id/pinned-products',
  validate(v.idParamSchema, 'params'),
  validate(v.adminLivePinProductsSchema),
  controller.pinLiveProducts,
);

/** DELETE /api/v1/admin/live-sessions/:id/comments/:commentId */
router.delete(
  '/:id/comments/:commentId',
  validate(v.liveCommentParamSchema, 'params'),
  validate(v.adminLiveCommentModerateSchema),
  controller.moderateLiveComment,
);

export default router;
