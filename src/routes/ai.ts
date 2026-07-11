import { Router } from 'express';
import * as aiController from '#controllers/ai.controller';
import { requireAuth } from '#middlewares/authMiddleware';
import { chatbotLimiter } from '#middlewares/rateLimiter';

import validate from '#middlewares/validate';
import * as aiValidation from '#validations/ai.validation';

const router = Router();

// SEC-BE-007: requireAuth + per-user rate limit untuk hindari abuse Gemini API.
router.use(requireAuth);

router.post(
  '/chatbot',
  chatbotLimiter,
  validate(aiValidation.chatbotSchema, 'body'),
  aiController.chatAssistant,
);

router.post('/predict', validate(aiValidation.predictSchema, 'body'), aiController.predictQuality);

router.get(
  '/predictions/recent',
  validate(aiValidation.recentPredictionsQuerySchema, 'all'),
  aiController.listRecentPredictions,
);

// SEC-BE-007 derivative: chatbotLimiter reused — cegah abuse Gemini Vision API per user.
router.post(
  '/generate-product-description',
  chatbotLimiter,
  validate(aiValidation.generateProductDescriptionSchema, 'body'),
  aiController.generateProductDescription,
);

export default router;
