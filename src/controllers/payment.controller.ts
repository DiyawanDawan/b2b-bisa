import { Request, Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as paymentService from '#services/payment.service';
import AppError from '#utils/appError';

/**
 * [PUBLIC] Xendit Callbacks. No standard Auth here!
 * Endpoint ini hanya diproteksi oleh Callback Token dari Xendit di Headers.
 */
export const xenditInvoiceWebhook = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers['x-callback-token'] as string;
  if (!token) throw new AppError('Akses Ditolak: Token Callback Webhook Tidak Tersedia', 401);

  await paymentService.handleXenditWebhook(req.body, token);

  // Xendit mewajibkan respond 200 HTTP OK text tanpa struktur tambahan
  res.status(200).send('Webhook Received');
});

/**
 * [PUBLIC] Xendit Payment Session/Request Callbacks (V3).
 */
export const xenditPaymentSessionWebhook = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers['x-callback-token'] as string;
  if (!token) throw new AppError('Akses Ditolak: Token Callback Webhook Tidak Tersedia', 401);

  await paymentService.handleXenditPaymentRequestWebhook(req.body, token);

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
