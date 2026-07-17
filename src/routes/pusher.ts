import { Router } from 'express';
import * as pusherController from '#controllers/pusher.controller';
import { requireAuth } from '#middlewares/authMiddleware';

const router = Router();

/**
 * SEC-MOB-004 backend pair.
 * POST /api/v1/pusher/auth
 * Pusher Private Channel authorization endpoint.
 *
 * Body (application/x-www-form-urlencoded, Pusher SDK convention):
 *   socket_id=...&channel_name=private-negotiation-{id}
 *   socket_id=...&channel_name=private-support-{ticketId}
 *
 * Hanya authenticated user yang merupakan participant negotiation / support
 * ticket (atau ADMIN) yang berhak menerima signed auth response.
 */
router.post('/auth', requireAuth, pusherController.authorizeChannel);

export default router;
