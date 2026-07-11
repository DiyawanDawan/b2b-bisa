import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole, requireTierPro } from '#middlewares/authMiddleware';
import { financialLimiter, publicVerifyLimiter } from '#middlewares/rateLimiter';
import * as v from '#validations/order.validation';
import { UserRole } from '#prisma';
import * as orderController from '#controllers/order.controller';

const router = Router();

/**
 * ==========================================
 * PUBLIC ROUTES (No Auth Required)
 * SEC-BE-014: publicVerifyLimiter (30/menit/IP) untuk hindari enumeration
 * orderNumber + SEC-BE-021 (entropy orderNumber dinaikkan ke 64-bit).
 * ==========================================
 */
router.get('/verify/:orderNumber', publicVerifyLimiter, orderController.verifyOrder);
router.get('/track/:orderNumber', publicVerifyLimiter, orderController.trackOrder);

// Wajib Login untuk Semua Aksi Bisnis Selanjutnya
router.use(requireAuth);

/**
 * ==========================================
 * B2B CONTRACT CREATION (SUPPLIER ONLY)
 * ==========================================
 */
router.post(
  '/contract',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.createContractSchema),
  orderController.createContract,
);

/**
 * ==========================================
 * BUYER DIRECT CHECKOUT (Skip Negotiation)
 * Cart items langsung dijadikan Order PENDING per supplier,
 * siap dibayar lewat /pay.
 * ==========================================
 */
router.post(
  '/direct/preview',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createDirectOrderSchema),
  orderController.previewDirectOrder,
);

router.get(
  '/direct/preview',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.previewDirectOrderFromCartQuerySchema, 'all'),
  orderController.previewDirectOrderFromCartItems,
);

router.post(
  '/direct',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.createDirectOrderSchema),
  orderController.createDirectOrder,
);

router.post(
  '/direct/batch-pay',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.batchCheckoutPaymentSchema),
  orderController.initializeBatchPayment,
);

if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/direct/batch-simulate-payment',
    financialLimiter,
    requireRole(UserRole.BUYER, UserRole.ADMIN),
    validate(v.batchSimulatePaymentSchema),
    orderController.simulateBatchPayment,
  );
}

router.put(
  '/:id/invoice',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.updatePendingInvoiceSchema),
  orderController.updatePendingInvoice,
);

/**
 * ==========================================
 * ORDERS LIST / TRACKING DASHBOARD
 * ==========================================
 */
// [BUYER] My Purchases Tab
router.get(
  '/my-purchases',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.listOrdersSchema, 'all'),
  orderController.getMyPurchases,
);

router.get(
  '/my-purchases/status-counts',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.orderStatusCountsSchema, 'all'),
  orderController.getMyPurchasesStatusCounts,
);

// [SUPPLIER] My Sales Tab
router.get(
  '/my-sales',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.listOrdersSchema, 'all'),
  orderController.getMySales,
);

router.get(
  '/my-sales/status-counts',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.orderStatusCountsSchema, 'all'),
  orderController.getMySalesStatusCounts,
);

router.get(
  '/sales-stats',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  orderController.getSalesStats,
);

/**
 * ==========================================
 * ORDER DETAILS & TRACKING UPDATE
 * ==========================================
 */
// [SUPPLIER] Update Logs / GPS Coordinate of Truck-Shipment
router.put(
  '/tracking/:id',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.updateTrackingSchema),
  orderController.updateTracking,
);

// [BUYER] Release Escrow Funds to Supplier Hand (Mark as Completed)
router.put(
  '/release-escrow/:id',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  orderController.releaseEscrow,
);

/**
 * ==========================================
 * PAYMENT INITIALIZATION (BUYER ONLY)
 * Dual-Mode: Invoice (Web) / PaymentRequest V3 (Mobile)
 * ==========================================
 */
router.post(
  '/:id/pay',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.initializePaymentSchema),
  orderController.initializePayment,
);

/** Development / test mode: simulasi lunas (mock atau Xendit Payment Request simulate). */
if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/:id/simulate-payment',
    financialLimiter,
    requireRole(UserRole.BUYER, UserRole.ADMIN),
    orderController.simulateOrderPayment,
  );
  router.post(
    '/:id/mock-confirm-payment',
    financialLimiter,
    requireRole(UserRole.BUYER, UserRole.ADMIN),
    orderController.mockConfirmPayment,
  );
}

router.post(
  '/:id/cancel-payment',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  orderController.cancelOrderPayment,
);

router.post(
  '/:id/payment-proof',
  financialLimiter,
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.uploadPaymentProofSchema),
  orderController.uploadPaymentProof,
);

/**
 * ==========================================
 * DISPUTE & COMPLAINTS (BUYER ONLY)
 * ==========================================
 */
router.post(
  '/:id/dispute',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.raiseDisputeSchema),
  orderController.raiseDispute,
);

router.post(
  '/:id/dispute/response',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.respondDisputeSchema),
  orderController.respondToDispute,
);

// [BOTH] Detail with Digital QR Contract & Escrow Maps
// PENTING: Harus paling bawah agar tidak menyerobot route spesifik di atas
router.post('/:id/sign', orderController.signContract);

router.get('/:id/batch', orderController.getCheckoutBatchDetail);
router.get('/:id', orderController.getOrderDetail);

export default router;
