import { Router } from 'express';
import * as transactionController from '#controllers/transaction.controller';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';

const router = Router();

// Public Webhook
router.post('/webhook', transactionController.handleXenditWebhook);

// Protected routes
router.use(requireAuth);

router.post('/:id/pay', requireRole('BUYER', 'ADMIN'), transactionController.createPaymentRequest);
router.post('/:id/release', requireRole('ADMIN'), transactionController.releaseEscrow);
router.post('/:id/refund', requireRole('ADMIN'), transactionController.refundTransaction);

// Export Transactions (CSV)
router.get('/export', transactionController.exportTransactions);

export default router;
