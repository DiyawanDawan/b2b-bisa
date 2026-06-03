import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

/**
 * GET /api/v1/admin/products
 */
router.get(
  '/',
  validate(adminValidation.listAllProductsSchema, 'query'),
  adminController.listAllProducts,
);

/**
 * GET /api/v1/admin/products/categories
 * Static path sebelum /:id/*
 */
router.get('/categories', adminController.listCategories);

/**
 * POST /api/v1/admin/products/categories
 */
router.post(
  '/categories',
  validate(adminValidation.categorySchema),
  adminController.createCategory,
);

/**
 * PUT /api/v1/admin/products/categories/:id
 */
router.put(
  '/categories/:id',
  validate(adminValidation.categorySchema),
  adminController.updateCategory,
);

/**
 * PATCH /api/v1/admin/products/:id/moderate
 */
router.patch(
  '/:id/moderate',
  validate(adminValidation.productIdParamSchema, 'params'),
  validate(adminValidation.moderateProductSchema),
  adminController.moderateProduct,
);

/**
 * PATCH /api/v1/admin/products/:id/certify
 */
router.patch(
  '/:id/certify',
  validate(adminValidation.productIdParamSchema, 'params'),
  validate(adminValidation.certifyProductSchema),
  adminController.certifyProduct,
);

export default router;
