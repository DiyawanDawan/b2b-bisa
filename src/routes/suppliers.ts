import { Router } from 'express';
import * as userController from '#controllers/user.controller';
import { optionalAuth } from '#middlewares/authMiddleware';

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
router.get('/:id/products', optionalAuth, userController.getSupplierProducts);

/**
 * @route   GET /api/v1/suppliers/:id/verification-status
 */
router.get('/:id/verification-status', optionalAuth, userController.getSupplierVerification);

export default router;
