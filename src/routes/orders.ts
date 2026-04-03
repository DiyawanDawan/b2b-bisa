import { Router } from 'express';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as v from '#validations/order.validation';
import { UserRole } from '#prisma';
import * as orderController from '#controllers/order.controller';

const router = Router();

/**
 * ==========================================
 * PUBLIC ROUTES (No Auth Required)
 * ==========================================
 */
router.get('/verify/:orderNumber', orderController.verifyOrder);

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
 * ORDERS LIST / TRACKING DASHBOARD
 * ==========================================
 */
// [BUYER] My Purchases Tab
router.get(
  '/my-purchases',
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  orderController.getMyPurchases,
);

// [SUPPLIER] My Sales Tab
router.get('/my-sales', requireRole(UserRole.SUPPLIER, UserRole.ADMIN), orderController.getMySales);

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
  requireRole(UserRole.BUYER, UserRole.ADMIN),
  validate(v.initializePaymentSchema),
  orderController.initializePayment,
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

// [BOTH] Detail with Digital QR Contract & Escrow Maps
// PENTING: Harus paling bawah agar tidak menyerobot route spesifik di atas
router.get('/:id', orderController.getOrderDetail);

export default router;
