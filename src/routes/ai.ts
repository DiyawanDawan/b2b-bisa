import { Router } from 'express';
import * as aiController from '#controllers/ai.controller';
import { requireAuth } from '#middlewares/authMiddleware';

import validate from '#middlewares/validate';
import * as aiValidation from '#validations/ai.validation';

const router = Router();

router.use(requireAuth);

router.post('/predict', validate(aiValidation.predictSchema, 'body'), aiController.predictQuality);

router.post('/chatbot', validate(aiValidation.chatbotSchema, 'body'), aiController.chatAssistant);

export default router;
