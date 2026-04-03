import { Request, Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import * as paymentService from '#services/payment.service';
import * as walletService from '#services/wallet.service';
import { AuthRequest } from '#types/index';

/**
 * [BUYER] Retrieve/Re-check Payment Link for a Transaction
 * Usually, the link is created during Contract creation in Order service.
 */
export const createPaymentRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Transaction ID
  // In our B2B flow, we find the existing transaction and return its paymentUrl
  const transaction = await walletService.getWalletTransactions(req.user!.id);
  successResponse(res, { id, transaction }, 'Detail transaksi tersedia');
});

/**
 * [ADMIN] Manually release Escrow to Supplier
 * In standard flow, Buyer triggers this from /orders/release-escrow/:id
 */
export const releaseEscrow = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Order ID
  const result = await walletService.releaseEscrow(id, req.user!.id);
  successResponse(res, result, 'Dana berhasil dicairkan ke Supplier');
});

/**
 * [ADMIN] Request refund for an order in Escrow
 */
export const refundTransaction = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Transaction ID
  const result = await walletService.refundToBuyer(id);
  successResponse(res, result, 'Dana berhasil direfund ke Buyer');
});

/**
 * [PUBLIC] Xendit Webhook Handler (Legacy/Redundant Link)
 * Use paymentController.xenditInvoiceWebhook for better security/validation.
 */
export const handleXenditWebhook = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers['x-callback-token'] as string;
  const result = await paymentService.handleXenditWebhook(req.body, token);
  if (result) {
    res.status(200).send('OK');
  } else {
    res.status(400).send('FAILED');
  }
});

/**
 * [ANY] Export My Transactions to CSV
 */
export const exportTransactions = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // 1. Fetch transactions (use data property from paginated result)
  const result = await walletService.getWalletTransactions(userId, 1, 1000);
  const transactions = result.data;

  // 2. Generate CSV Content
  const headers = [
    'ID',
    'Order No',
    'Amount',
    'Platform Fee',
    'Net Seller Amount',
    'Type',
    'Payment Status',
    'Paid At',
    'Created At',
  ];

  const rows = transactions.map((t: any) => [
    t.id,
    t.order?.orderNumber || 'N/A',
    t.amount.toString(),
    t.platformFee.toString(),
    t.sellerAmount.toString(),
    t.type,
    t.paymentStatus || t.status,
    t.paidAt ? new Date(t.paidAt).toISOString() : '-',
    new Date(t.createdAt).toISOString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(',')),
  ].join('\n');

  // 3. Send Response as File
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=BISA_B2B_Transactions_${new Date().toISOString().split('T')[0]}.csv`,
  );

  res.status(200).send(csvContent);
});
