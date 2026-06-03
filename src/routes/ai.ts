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

export default router;
