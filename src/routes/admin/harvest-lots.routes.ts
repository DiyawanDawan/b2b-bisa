import { Router } from 'express';
import validate from '#middlewares/validate';
import * as c from '#controllers/admin-catalog.controller';
import * as v from '#validations/admin-catalog.validation';

const router = Router();

router.get('/', validate(v.adminListHarvestLotsSchema, 'query'), c.listHarvestLots);
router.get('/:id', validate(v.idParamSchema, 'params'), c.getHarvestLot);
router.post(
  '/:id/archive',
  validate(v.idParamSchema, 'params'),
  validate(v.adminArchiveHarvestLotSchema),
  c.archiveHarvestLot,
);
router.post('/:id/restore', validate(v.idParamSchema, 'params'), c.restoreHarvestLot);

export default router;
