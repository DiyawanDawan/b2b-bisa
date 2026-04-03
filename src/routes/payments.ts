import { Router } from 'express';
import * as paymentController from '#controllers/payment.controller';

const router = Router();

// ==========================================
// [PUBLIC] WEBHOOK PAYMENT LISTENER
// Dilarang memakai requireAuth di sini!
// ==========================================
router.post('/xendit-webhook', paymentController.xenditInvoiceWebhook);
router.post('/payout-webhook', paymentController.xenditPayoutWebhook);
router.post('/session-webhook', paymentController.xenditPaymentSessionWebhook);

// ==========================================
// [PUBLIC] PAYMENT METHODS CATALOG
// ==========================================
router.get('/channels', paymentController.paymentChannels);

export default router;
