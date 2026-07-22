import { Router } from 'express';
import * as paymentController from '#controllers/payment.controller';
import { webhookLimiter, publicApiLimiter } from '#middlewares/rateLimiter';

const router = Router();

// ==========================================
// [PUBLIC] WEBHOOK PAYMENT LISTENER
// Dilarang memakai requireAuth di sini! Signature di-verify constant-time di service.
// SEC-BE-006: tambahan webhookLimiter sebagai defense-in-depth.
// ==========================================
router.post('/xendit-webhook', webhookLimiter, paymentController.xenditInvoiceWebhook);
router.post('/payout-webhook', webhookLimiter, paymentController.xenditPayoutWebhook);
router.post('/session-webhook', webhookLimiter, paymentController.xenditPaymentSessionWebhook);

// ==========================================
// [PUBLIC] PAYMENT METHODS CATALOG
// ==========================================
router.get('/channels', publicApiLimiter, paymentController.paymentChannels);
router.get('/fees', publicApiLimiter, paymentController.listPlatformFeesPublic);

export default router;
