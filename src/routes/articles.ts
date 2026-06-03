import { Router } from 'express';
import * as articleController from '#controllers/article.controller';
import { requireAuth, requireRole, optionalAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as articleValidation from '#validations/article.validation';
import { UserRole } from '#prisma';

const router = Router();

/**
 * ==========================================
 * PUBLIC ROUTES
 * ==========================================
 */

// List articles with pagination & filters
router.get(
  '/',
  optionalAuth,
  validate(articleValidation.listArticlesSchema, 'all'),
  articleController.listArticles,
);

// Get single article detail
router.get(
  '/:id',
  optionalAuth,
  validate(articleValidation.getArticleSchema, 'all'),
  articleController.getArticle,
);

/**
 * ==========================================
 * ADMIN ONLY ROUTES
 * ==========================================
 */

// Protected routes require authentication
router.use(requireAuth);

// Create new article
router.post(
  '/',
  requireRole(UserRole.ADMIN),
  validate(articleValidation.createArticleSchema, 'all'),
  articleController.createArticle,
);

// Update existing article
router.put(
  '/:id',
  requireRole(UserRole.ADMIN),
  validate(articleValidation.updateArticleSchema, 'all'),
  articleController.updateArticle,
);

// Delete article
router.delete('/:id', requireRole(UserRole.ADMIN), articleController.deleteArticle);

export default router;
