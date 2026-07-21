import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';
import * as productCertificateController from '#controllers/product-certificate.controller';
import * as storeCertificateController from '#controllers/supplier-store-certificate.controller';
import * as certificateValidation from '#validations/product-certificate.validation';

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
router.get(
  '/categories',
  validate(adminValidation.listCategoriesQuerySchema, 'query'),
  adminController.listCategories,
);

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

router.get(
  '/certificates',
  validate(certificateValidation.listCertificateQueueSchema, 'query'),
  productCertificateController.listAdmin,
);
router.get(
  '/certificates/:certificateId',
  validate(certificateValidation.certificateIdParamSchema, 'params'),
  productCertificateController.adminDetail,
);
router.patch(
  '/certificates/:certificateId/review',
  validate(certificateValidation.certificateIdParamSchema, 'params'),
  validate(certificateValidation.reviewCertificateSchema),
  productCertificateController.review,
);

router.get(
  '/store-certificates',
  validate(certificateValidation.listCertificateQueueSchema, 'query'),
  storeCertificateController.listAdmin,
);
router.get(
  '/store-certificates/:certificateId',
  validate(certificateValidation.certificateIdParamSchema, 'params'),
  storeCertificateController.adminDetail,
);
router.patch(
  '/store-certificates/:certificateId/review',
  validate(certificateValidation.certificateIdParamSchema, 'params'),
  validate(certificateValidation.reviewCertificateSchema),
  storeCertificateController.review,
);

/**
 * GET /api/v1/admin/products/:id/certificates
 */
router.get(
  '/:id/certificates',
  validate(adminValidation.productIdParamSchema, 'params'),
  productCertificateController.listAdminByProduct,
);

/**
 * GET /api/v1/admin/products/:id
 */
router.get(
  '/:id',
  validate(adminValidation.productIdParamSchema, 'params'),
  adminController.getProductDetail,
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
