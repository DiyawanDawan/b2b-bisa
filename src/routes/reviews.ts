import { Router } from 'express';
import * as reviewController from '#controllers/review.controller';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as v from '#validations/review.validation';

const router = Router();

// ==========================================
// [BUYER] MY REVIEW HISTORY
// ==========================================
router.get(
  '/my-reviews',
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.BUYER),
  reviewController.getMyReviews,
);

// = [PUBLIC] GET PRODUCT REVIEWS =
router.get(
  '/products/:productId',
  validate(v.getProductReviewsQuerySchema, 'query'),
  reviewController.getReviewsByProduct,
);

// = [PUBLIC] GET PRODUCT REVIEW SUMMARY (Rating Badge) =
router.get('/products/:productId/summary', reviewController.getReviewSummary);

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

router.patch(
  '/:reviewId',
  requireAuth,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.updateReviewSchema), // use update schema
  reviewController.updateReview,
);

router.patch(
  '/:reviewId/reply',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.replyReviewSchema),
  reviewController.replyReview,
);

export default router;
