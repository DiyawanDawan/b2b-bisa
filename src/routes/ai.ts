import { Router } from 'express';
import * as aiController from '#controllers/ai.controller';
import { optionalAuth, requireAuth } from '#middlewares/authMiddleware';
import { chatbotLimiter } from '#middlewares/rateLimiter';

import validate from '#middlewares/validate';
import * as aiValidation from '#validations/ai.validation';

const router = Router();

// Asisten BISA: publik tanpa login (guest + optionalAuth jika ada token).
router.post(
  '/chatbot',
  optionalAuth,
  chatbotLimiter,
  validate(aiValidation.chatbotSchema, 'body'),
  aiController.chatAssistant,
);

// Endpoint AI lain tetap wajib login.
router.post(
  '/predict',
  requireAuth,
  validate(aiValidation.predictSchema, 'body'),
  aiController.predictQuality,
);

router.get(
  '/predictions/recent',
  requireAuth,
  validate(aiValidation.recentPredictionsQuerySchema, 'all'),
  aiController.listRecentPredictions,
);

// SEC-BE-007 derivative: chatbotLimiter reused — cegah abuse Gemini Vision API per user.
router.post(
  '/generate-product-description',
  requireAuth,
  chatbotLimiter,
  validate(aiValidation.generateProductDescriptionSchema, 'body'),
  aiController.generateProductDescription,
);

export default router;
