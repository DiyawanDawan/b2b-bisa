import { Router } from 'express';
import * as productController from '#controllers/product.controller';
import validate from '#middlewares/validate';
import { requireAuth, requireRole, optionalAuth } from '#middlewares/authMiddleware';
import upload from '#middlewares/upload';
import * as v from '#validations/product.validation';
const router = Router();

// Public routes
router.get(
  '/',
  optionalAuth,
  validate(v.productFilterSchema, 'query'),
  productController.listProducts,
);
router.get('/me', requireAuth, requireRole('SUPPLIER', 'ADMIN'), productController.getMyProducts);
router.get('/:id', optionalAuth, productController.getProductById);

// Supplier-only routes
router.post(
  '/',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  upload.array('images', 8),
  validate(v.createProductSchema),
  productController.createProduct,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  upload.array('images', 8),
  validate(v.updateProductSchema),
  productController.updateProduct,
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  productController.deleteProduct,
);

export default router;
