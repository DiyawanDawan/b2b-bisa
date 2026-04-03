import { Router } from 'express';
import * as categoryController from '#controllers/category.controller';

const router = Router();

/**
 * @route   GET /api/v1/categories
 */
router.get('/', categoryController.listCategories);

/**
 * @route   GET /api/v1/categories/:id
 */
router.get('/:id', categoryController.getCategoryById);

export default router;
