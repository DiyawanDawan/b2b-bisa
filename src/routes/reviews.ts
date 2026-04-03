import { Router } from 'express';
import * as reviewController from '#controllers/review.controller';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as v from '#validations/review.validation';
import { UserRole } from '#prisma';

const router = Router();

// ==========================================
// [BUYER] MY REVIEW HISTORY
// ==========================================
router.get(
  '/my-reviews',
  requireAuth,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  reviewController.getMyReviews,
);

// = [PUBLIC] GET PRODUCT REVIEWS =
router.get('/products/:productId', reviewController.getReviewsByProduct);

// ==========================================
// [BUYER] CREATE A REVIEW AFTER ORDER COMPLETED
// ==========================================
router.post(
  '/',
  requireAuth,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createReviewSchema),
  reviewController.postReview,
);

export default router;
