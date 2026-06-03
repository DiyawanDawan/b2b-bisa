import { Router } from 'express';
import * as extendedController from '#controllers/admin-extended.controller';
import validate from '#middlewares/validate';
import {
  createRegionSchema,
  updateRegionSchema,
  regionLevelQuerySchema,
  listRegionsSchema,
} from '#validations/admin.validation';

const router = Router();

router.get('/regions', validate(listRegionsSchema, 'query'), extendedController.listRegions);
router.post('/regions', validate(createRegionSchema), extendedController.createRegion);
router.patch('/regions/:id', validate(updateRegionSchema), extendedController.updateRegion);
router.delete(
  '/regions/:id',
  validate(regionLevelQuerySchema, 'query'),
  extendedController.deleteRegion,
);

export default router;
