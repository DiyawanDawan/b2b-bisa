import { Router } from 'express';
import * as productController from '#controllers/product.controller';
import validate from '#middlewares/validate';
import { requireAuth, requireRole, optionalAuth } from '#middlewares/authMiddleware';
import upload from '#middlewares/upload';
import uploadProduct from '#middlewares/uploadProduct';
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
router.get(
  '/engagement',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  productController.getSupplierEngagement,
);
router.get('/featured', optionalAuth, productController.getFeaturedProducts);
router.get('/collections', optionalAuth, productController.getCollections);
router.get('/collections/:slug', optionalAuth, productController.getCollectionProducts);
router.get(
  '/:id/stats',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  productController.getProductStats,
);
router.post(
  '/:id/duplicate',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  productController.duplicateProduct,
);
router.get('/:id', optionalAuth, productController.getProductById);

// Supplier-only routes
router.post(
  '/',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  uploadProduct.array('images', 5),
  validate(v.createProductSchema),
  productController.createProduct,
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('SUPPLIER', 'ADMIN'),
  uploadProduct.array('images', 5),
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
