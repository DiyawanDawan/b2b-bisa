import { Router } from 'express';
import * as userController from '#controllers/user.controller';
import * as supplierTradeController from '#controllers/supplier-trade.controller';
import { optionalAuth } from '#middlewares/authMiddleware';
import * as productCertificateController from '#controllers/product-certificate.controller';
import * as storeCertificateController from '#controllers/supplier-store-certificate.controller';
import validate from '#middlewares/validate';
import * as certificateValidation from '#validations/product-certificate.validation';

const router = Router();

/**
 * @route   GET /api/v1/suppliers
 * @desc    Public directory of verified suppliers
 * @access  Public
 */
router.get('/', optionalAuth, userController.listSuppliers);

/**
 * @route   GET /api/v1/suppliers/:id
 */
/**
 * @route   GET /api/v1/suppliers/:id/products
 */
router.get(
  '/:id/trade-stats',
  optionalAuth,
  validate(certificateValidation.supplierIdParamSchema, 'params'),
  supplierTradeController.getTradeStats,
);
router.get(
  '/:id/products',
  optionalAuth,
  validate(certificateValidation.supplierIdParamSchema, 'params'),
  userController.getSupplierProducts,
);
router.get(
  '/:id/certificates',
  optionalAuth,
  validate(certificateValidation.supplierIdParamSchema, 'params'),
  validate(certificateValidation.listPublicSupplierCertificatesSchema, 'query'),
  productCertificateController.listPublicSupplier,
);
router.get(
  '/:id/store-certificates',
  optionalAuth,
  validate(certificateValidation.supplierIdParamSchema, 'params'),
  storeCertificateController.listPublic,
);
router.get(
  '/:id/store-certificates/:certificateId/document',
  optionalAuth,
  validate(certificateValidation.supplierIdParamSchema, 'params'),
  validate(certificateValidation.certificateIdParamSchema, 'params'),
  storeCertificateController.openPublicDocument,
);

/**
 * @route   GET /api/v1/suppliers/:id/verification-status
 */
router.get(
  '/:id/verification-status',
  optionalAuth,
  validate(certificateValidation.supplierIdParamSchema, 'params'),
  userController.getSupplierVerification,
);

export default router;
