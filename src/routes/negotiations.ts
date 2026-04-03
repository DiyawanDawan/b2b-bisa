import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as v from '#validations/negotiation.validation';
import { UserRole } from '#prisma';
import * as negotiationController from '#controllers/negotiation.controller';

const router = Router();

router.use(requireAuth);

/**
 * ==========================================
 * NEGOTIATION MANAGEMENT
 * ==========================================
 */
// [BUYER]
router.post(
  '/',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createNegotiationSchema),
  negotiationController.createOffer,
);

router.get(
  '/my-offers',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  negotiationController.getMyOffers,
);

// [SUPPLIER]
router.get(
  '/incoming',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  negotiationController.getIncomingOffers,
);

router.put(
  '/:id/status',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.updateNegotiationStatusSchema),
  negotiationController.updateStatus,
);

// [BOTH] Get Detail of One Negotiation Room
// PENTING: Harus setelah semua path statis (/my-offers, /incoming)
router.get('/:id', negotiationController.getNegotiationDetail);

/**
 * ==========================================
 * CHAT SYSTEM (Inside a Negotiation)
 * ==========================================
 */
// [BOTH]
router.post('/:id/messages', validate(v.chatMessageSchema), negotiationController.sendChat);

router.get('/:id/messages', negotiationController.getChats);

export default router;
