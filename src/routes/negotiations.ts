import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as v from '#validations/negotiation.validation';
import * as orderV from '#validations/order.validation';
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
  validate(v.listNegotiationsSchema, 'all'),
  negotiationController.getMyOffers,
);

// [SUPPLIER]
router.get(
  '/incoming',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.listNegotiationsSchema, 'all'),
  negotiationController.getIncomingOffers,
);

router.put(
  '/:id/status',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.updateNegotiationStatusSchema),
  negotiationController.updateStatus,
);

router.put(
  '/:id/counter-offer',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.counterOfferSchema),
  negotiationController.counterOffer,
);

router.put(
  '/:id/cancel',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.cancelNegotiationSchema),
  negotiationController.cancelNegotiation,
);

router.get(
  '/:id/invoice-preview',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  negotiationController.getInvoicePreview,
);

router.post(
  '/:id/invoice-preview',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(orderV.invoicePreviewBodySchema),
  negotiationController.postInvoicePreview,
);

// [BOTH] Ruang chat per produk — harus sebelum /:id
router.get('/by-product/:productId', negotiationController.getRoomByProduct);

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
router.put(
  '/:id/messages/:messageId',
  validate(v.editChatMessageSchema),
  negotiationController.editChat,
);
router.delete('/:id/messages/:messageId', negotiationController.deleteChat);
router.delete('/:id/messages', negotiationController.clearChat);

router.get('/:id/messages', negotiationController.getChats);
router.put('/:id/read', negotiationController.markAsRead);
router.post('/:id/typing', negotiationController.setTypingStatus);

export default router;
