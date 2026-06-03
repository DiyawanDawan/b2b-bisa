import { Router } from 'express';
// Relative import (bukan #controllers alias) karena TS Server di IDE punya bug
// kadang tidak re-index file baru pasca delete+recreate. tsc CLI menerima
// kedua bentuk tanpa masalah. Saat IDE di-Restart TS Server boleh dikembalikan
// ke `#controllers/pusher.controller` untuk konsistensi.
import * as pusherController from '../controllers/pusher.controller';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

/**
 * SEC-MOB-004 backend pair.
 * POST /api/v1/pusher/auth
 * Pusher Private Channel authorization endpoint.
 *
 * Body (application/x-www-form-urlencoded, Pusher SDK convention):
 *   socket_id=...&channel_name=private-negotiation-{id}
 *
 * Hanya authenticated user yang merupakan participant negotiation/forum
 * yang berhak menerima signed auth response.
 */
router.post('/auth', requireAuth, pusherController.authorizeChannel);

export default router;
