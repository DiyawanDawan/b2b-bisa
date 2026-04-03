import { Router } from 'express';

const router = Router();

// /api/chatbot
router.post('/', (req, res) => {
  res.json({ message: 'Chatbot AI untuk konsultasi' });
});

export default router;
