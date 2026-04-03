import { Router } from 'express';

const router = Router();

// /api/articles
router.get('/', (req, res) => {
  res.json({ message: 'List artikel edukasi' });
});

export default router;
