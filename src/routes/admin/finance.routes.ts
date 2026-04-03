import { Router } from 'express';
import * as adminController from '#controllers/admin.controller';
import validate from '#middlewares/validate';
import * as adminValidation from '#validations/admin.validation';

const router = Router();

/**
 * GET /api/v1/admin/finance/stats
 * Monitoring pendapatan: Escrow held vs Released.
 */
router.get('/stats', adminController.getFinanceStats);

/**
 * GET /api/v1/admin/finance/transactions
 * Global Ledger Audit.
 */
router.get(
  '/transactions',
  validate(adminValidation.listTransactionsSchema, 'query'),
  adminController.listTransactions,
);

/**
 * GET /api/v1/admin/finance/fees
 * Platform Fee management.
 */
router.get('/fees', adminController.listFees);

/**
 * POST /api/v1/admin/finance/fees
 */
router.post('/fees', validate(adminValidation.feeSchema), adminController.createFee);

/**
 * PATCH /api/v1/admin/finance/fees/:id
 */
router.patch('/fees/:id', validate(adminValidation.updateFeeSchema), adminController.updateFee);

/**
 * Payout & Reporting Extensions (Phase 5)
 */

/**
 * GET /api/v1/admin/finance/payouts
 * Withdrawal Queue Management.
 */
router.get('/payouts', adminController.listPayoutQueue);

/**
 * PATCH /api/v1/admin/finance/payouts/:id/approve
 */
router.patch(
  '/payouts/:id/approve',
  validate(adminValidation.approvePayoutSchema),
  adminController.approvePayout,
);

/**
 * GET /api/v1/admin/finance/reports/export
 * Historical Ledger Export (CSV).
 */
router.get('/reports/export', adminController.exportTransactionsCsv);

export default router;
