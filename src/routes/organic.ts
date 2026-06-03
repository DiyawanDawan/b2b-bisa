import { Router, Request, Response, NextFunction } from 'express';
import * as productController from '#controllers/product.controller';
import * as categoryController from '#controllers/category.controller';
import { optionalAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as v from '#validations/product.validation';
import { ProductMode } from '#prisma';

const router = Router();

// Middleware to force organic productMode filter
const forceOrganicMode = (req: Request, res: Response, next: NextFunction) => {
  req.query.productMode = ProductMode.ORGANIC_PRODUCE;
  next();
};

/**
 * @route   GET /api/v1/organic/products
 * @desc    Get only organic agriculture products
 */
router.get(
  '/products',
  optionalAuth,
  forceOrganicMode,
  validate(v.productFilterSchema, 'query'),
  productController.listProducts,
);

/**
 * @route   GET /api/v1/organic/categories
 * @desc    Get only organic agriculture categories
 */
router.get('/categories', forceOrganicMode, categoryController.listCategories);

export default router;
