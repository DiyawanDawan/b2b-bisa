import { Router } from 'express';
import validate from '#middlewares/validate';
import * as c from '#controllers/admin-catalog.controller';
import * as v from '#validations/admin-catalog.validation';

const router = Router();

router.get('/', validate(v.adminListStoreBannersSchema, 'query'), c.listStoreBanners);
router.get('/:id', validate(v.idParamSchema, 'params'), c.getStoreBanner);
router.get(
  '/:id/history',
  validate(v.idParamSchema, 'params'),
  validate(v.adminBannerHistoryQuerySchema, 'query'),
  c.listStoreBannerHistory,
);
router.post(
  '/:id/moderate',
  validate(v.idParamSchema, 'params'),
  validate(v.adminModerateStoreBannerSchema),
  c.moderateStoreBanner,
);
router.patch(
  '/:id',
  validate(v.idParamSchema, 'params'),
  validate(v.adminUpdateStoreBannerScheduleSchema),
  c.updateStoreBannerSchedule,
);

export default router;
