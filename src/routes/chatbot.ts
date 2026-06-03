import { Router } from 'express';
import { successResponse } from '#utils/response.util';
import { requireAuth } from '#middlewares/authMiddleware';

const router = Router();

// /api/chatbot
router.post('/', requireAuth, (req, res) => {
  return successResponse(res, null, 'Chatbot AI untuk konsultasi');
});

export default router;
