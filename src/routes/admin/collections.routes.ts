import { Router } from 'express';
import validate from '#middlewares/validate';
import * as c from '#controllers/admin-catalog.controller';
import * as v from '#validations/admin-catalog.validation';

const router = Router();

router.get('/', validate(v.adminListCollectionsSchema, 'query'), c.listCollections);
router.post('/', validate(v.adminCreateCollectionSchema), c.createCollection);
router.get('/:id', validate(v.idParamSchema, 'params'), c.getCollection);
router.patch(
  '/:id',
  validate(v.idParamSchema, 'params'),
  validate(v.adminUpdateCollectionSchema),
  c.updateCollection,
);
router.delete('/:id', validate(v.idParamSchema, 'params'), c.deleteCollection);
router.put(
  '/:id/products',
  validate(v.idParamSchema, 'params'),
  validate(v.adminAssignCollectionProductsSchema),
  c.assignCollectionProducts,
);
router.put(
  '/:id/products/reorder',
  validate(v.idParamSchema, 'params'),
  validate(v.adminReorderCollectionSchema),
  c.reorderCollectionProducts,
);

export default router;
