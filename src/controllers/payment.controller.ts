import { Request, Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as paymentService from '#services/payment.service';
import AppError from '#utils/appError';
import { normalizeXenditWebhookPayload } from '#constants/xendit.constants';

const dispatchXenditWebhook = async (body: unknown, token: string): Promise<void> => {
  const normalized = normalizeXenditWebhookPayload(body);

  if (normalized.kind === 'ignored') {
    console.log(
      `[XENDIT WEBHOOK] Event "${normalized.event}" diabaikan (bukan webhook pembayaran order).`,
    );
    paymentService.verifyXenditWebhookToken(token);
    return;
  }

  if (normalized.kind === 'payment_v3') {
    await paymentService.handleXenditPaymentRequestWebhook(body, token);
    return;
  }

  if (normalized.kind === 'payout') {
    await paymentService.handleXenditPayoutWebhook(body, token);
    return;
  }

  if (normalized.kind === 'invoice') {
    await paymentService.handleXenditWebhook(body, token);
    return;
  }

  // Sample/test webhook tanpa external_id — acknowledge saja agar Xendit tidak retry
  paymentService.verifyXenditWebhookToken(token);
  console.warn(
    `[XENDIT WEBHOOK] Event "${normalized.event ?? 'unknown'}" tidak diproses (tidak ada external_id/reference_id).`,
  );
};

/**
 * [PUBLIC] Xendit Callbacks. No standard Auth here!
 * Endpoint ini hanya diproteksi oleh Callback Token dari Xendit di Headers.
 * Legacy Invoice, Payment v3, dan event non-order (payment_method.*) didukung.
 */
export const xenditInvoiceWebhook = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers['x-callback-token'] as string;
  if (!token) throw new AppError('Akses Ditolak: Token Callback Webhook Tidak Tersedia', 401);

  const normalized = normalizeXenditWebhookPayload(req.body);
  console.log(
    `[XENDIT WEBHOOK] POST /payments/xendit-webhook ` +
      `event=${normalized.event ?? 'n/a'} reference=${normalized.externalId ?? 'n/a'} ` +
      `status=${normalized.status || 'n/a'} kind=${normalized.kind}`,
  );

  await dispatchXenditWebhook(req.body, token);

  // Xendit mewajibkan respond 200 HTTP OK text tanpa struktur tambahan
  res.status(200).send('Webhook Received');
});

/**
 * [PUBLIC] Xendit Payment Session/Request Callbacks (V3).
 */
export const xenditPaymentSessionWebhook = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers['x-callback-token'] as string;
  if (!token) throw new AppError('Akses Ditolak: Token Callback Webhook Tidak Tersedia', 401);

  const normalized = normalizeXenditWebhookPayload(req.body);
  console.log(
    `[XENDIT WEBHOOK] POST /payments/session-webhook ` +
      `event=${normalized.event ?? 'n/a'} reference=${normalized.externalId ?? 'n/a'} ` +
      `status=${normalized.status || 'n/a'}`,
  );

  await dispatchXenditWebhook(req.body, token);

  res.status(200).send('Webhook Received');
});

/**
 * [PUBLIC] Xendit Payout Callbacks.
 */
export const xenditPayoutWebhook = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers['x-callback-token'] as string;
  if (!token) throw new AppError('Akses Ditolak: Token Callback Webhook Tidak Tersedia', 401);

  await paymentService.handleXenditPayoutWebhook(req.body, token);

  res.status(200).send('Webhook Received');
});

/**
 * [ANY ROLE] List Online Payment Methods (Virtual Account, E-Wallet, QRIS)
 */
export const paymentChannels = catchAsync(async (_req: Request, res: Response) => {
  const channels = await paymentService.getAvailableChannels();
  successResponse(res, channels, 'Daftar Metode Pembayaran yang tersedia.');
});

/**
 * [PUBLIC] Daftar biaya platform aktif (untuk transparansi mobile).
 */
export const listPlatformFeesPublic = catchAsync(async (_req: Request, res: Response) => {
  const { listActivePlatformFees } = await import('#utils/platformFee.util');
  const fees = await listActivePlatformFees();
  successResponse(
    res,
    fees.filter((f) => f.isActive),
    'Daftar biaya platform aktif.',
  );
});
