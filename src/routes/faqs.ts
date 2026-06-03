import { Router } from 'express';
import * as faqController from '#controllers/faq.controller';
import { requireAuth, requireRole, optionalAuth } from '#middlewares/authMiddleware';
import validate from '#middlewares/validate';
import * as faqValidation from '#validations/faq.validation';
import { UserRole } from '#prisma';

const router = Router();

router.get(
  '/',
  optionalAuth,
  validate(faqValidation.listFaqsSchema, 'all'),
  faqController.listFaqs,
);

router.get('/:id', optionalAuth, validate(faqValidation.getFaqSchema, 'all'), faqController.getFaq);

router.use(requireAuth);

router.post(
  '/',
  requireRole(UserRole.ADMIN),
  validate(faqValidation.createFaqSchema, 'all'),
  faqController.createFaq,
);

router.put(
  '/:id',
  requireRole(UserRole.ADMIN),
  validate(faqValidation.updateFaqSchema, 'all'),
  faqController.updateFaq,
);

router.delete('/:id', requireRole(UserRole.ADMIN), faqController.deleteFaq);

export default router;
