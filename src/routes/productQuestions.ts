import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import { UserRole } from '#prisma';
import * as productQuestionController from '#controllers/product-question.controller';
import * as v from '#validations/product-question.validation';

const router = Router();

router.post(
  '/:id/answer',
  requireAuth,
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.answerProductQuestionSchema),
  productQuestionController.answerQuestion,
);

export default router;
