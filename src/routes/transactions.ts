import { Router } from 'express';
import * as transactionController from '#controllers/transaction.controller';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';

const router = Router();

// Public Webhook
// Public Webhook removed (moved to payments.ts)

// Protected routes
router.use(requireAuth);

// [BUYER] Get Transaction Details
router.get(
  '/:id',
  requireRole('BUYER', 'SUPPLIER', 'ADMIN'),
  transactionController.getTransactionById,
);

router.post('/:id/pay', requireRole('BUYER', 'ADMIN'), transactionController.createPaymentRequest);
router.post('/:id/release', requireRole('ADMIN'), transactionController.releaseEscrow);
router.post('/:id/refund', requireRole('ADMIN'), transactionController.refundTransaction);

// Export Transactions (CSV)
router.get('/export', requireRole('SUPPLIER', 'ADMIN'), transactionController.exportTransactions);

export default router;
