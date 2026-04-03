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
router.get('/:id', optionalAuth, userController.getSupplierDetail);

export default router;
