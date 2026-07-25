import { Router } from 'express';
import validate from '#middlewares/validate';
import * as v from '#validations/admin-core.validation';
import * as controller from '#controllers/admin-core.controller';

const router = Router();

/** GET /api/v1/admin/reviews */
router.get('/', validate(v.adminListReviewsSchema, 'query'), controller.listReviews);

/** GET /api/v1/admin/reviews/:id */
router.get('/:id', validate(v.idParamSchema, 'params'), controller.getReview);

/** POST /api/v1/admin/reviews/:id/hide */
router.post(
  '/:id/hide',
  validate(v.idParamSchema, 'params'),
  validate(v.adminReviewHideSchema),
  controller.hideReview,
);

/** POST /api/v1/admin/reviews/:id/restore */
router.post('/:id/restore', validate(v.idParamSchema, 'params'), controller.restoreReview);

/** POST /api/v1/admin/reviews/:id/flag */
router.post(
  '/:id/flag',
  validate(v.idParamSchema, 'params'),
  validate(v.adminReviewFlagSchema),
  controller.flagReview,
);

export default router;
