import { Router } from 'express';
import * as productController from '#controllers/product.controller';
import validate from '#middlewares/validate';
import { requireAuth, requireRole, optionalAuth } from '#middlewares/authMiddleware';
import upload from '#middlewares/upload';
import uploadProduct from '#middlewares/uploadProduct';
import uploadProductVideo from '#middlewares/uploadProductVideo';
import * as v from '#validations/product.validation';
import * as productQuestionController from '#controllers/product-question.controller';
import * as productBulkController from '#controllers/product-bulk.controller';
import * as pq from '#validations/product-question.validation';
import { UserRole } from '#prisma';
import uploadCsv from '#middlewares/uploadCsv';

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
  '/bulk/template',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  productBulkController.downloadBulkTemplate,
);
router.post(
  '/bulk',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  uploadCsv.single('file'),
  productBulkController.uploadBulkCsv,
);
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
router.get('/:id/recommendations', optionalAuth, productController.getProductRecommendations);
router.post(
  '/:id/promote',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.promoteProductSchema),
  productController.promoteProduct,
);
router.post('/:id/promo-impression', productController.recordPromoImpression);
router.post('/:id/promo-click', productController.recordPromoClick);
router.post(
  '/:id/video',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  uploadProductVideo.single('video'),
  productController.uploadProductVideo,
);
router.delete(
  '/:id/video',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  productController.deleteProductVideo,
);
router.get(
  '/:productId/questions',
  optionalAuth,
  validate(pq.listProductQuestionsSchema, 'all'),
  productQuestionController.listByProduct,
);
router.post(
  '/:productId/questions',
  requireAuth,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(pq.askProductQuestionSchema),
  productQuestionController.askQuestion,
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
