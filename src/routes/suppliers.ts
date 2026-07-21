import { Router } from 'express';
import * as userController from '#controllers/user.controller';
import * as supplierTradeController from '#controllers/supplier-trade.controller';
import { optionalAuth } from '#middlewares/authMiddleware';
import * as productCertificateController from '#controllers/product-certificate.controller';

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
router.get('/:id/trade-stats', optionalAuth, supplierTradeController.getTradeStats);
router.get('/:id/products', optionalAuth, userController.getSupplierProducts);
router.get('/:id/certificates', optionalAuth, productCertificateController.listPublicSupplier);

/**
 * @route   GET /api/v1/suppliers/:id/verification-status
 */
router.get('/:id/verification-status', optionalAuth, userController.getSupplierVerification);

export default router;
