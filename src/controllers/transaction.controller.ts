import { Request, Response } from 'express';
import catchAsync from '#utils/catchAsync';
import { successResponse } from '#utils/response.util';
import { toCsv } from '#utils/csv.util';
import * as paymentService from '#services/payment.service';
import * as walletService from '#services/wallet.service';
import * as orderService from '#services/order.service';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { UserRole } from '#prisma';
import { AuthRequest } from '#types/index';
import { attachTransactionMediaUrls } from '#utils/mediaResolver.util';

/**
 * [BUYER/SUPPLIER] Get Transaction Details by ID
 */
export const getTransactionById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          buyer: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              province: true,
              regency: true,
            },
          },
          seller: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              province: true,
              regency: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  pricePerUnit: true,
                  unit: true,
                  thumbnailUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!transaction) throw new AppError('Transaksi tidak ditemukan.', 404);
  if (req.user!.role !== UserRole.ADMIN && transaction.userId !== req.user!.id) {
    throw new AppError('Akses ditolak untuk transaksi ini.', 403);
  }

  successResponse(
    res,
    attachTransactionMediaUrls(transaction),
    'Detail transaksi berhasil diambil',
  );
});

/**
 * Usually, the link is created during Contract creation in Order service.
 */
export const createPaymentRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Transaction ID
  const channelCode = typeof req.body?.channelCode === 'string' ? req.body.channelCode : undefined;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      orderId: true,
      paymentUrl: true,
      paymentRequestId: true,
      xenditInvoiceId: true,
      providerActions: true,
    },
  });

  if (!transaction) throw new AppError('Transaksi tidak ditemukan.', 404);
  if (req.user!.role !== UserRole.ADMIN && transaction.userId !== req.user!.id) {
    throw new AppError('Akses ditolak untuk transaksi ini.', 403);
  }

  if (transaction.paymentRequestId || transaction.xenditInvoiceId || transaction.paymentUrl) {
    successResponse(
      res,
      {
        transactionId: transaction.id,
        paymentRequestId: transaction.paymentRequestId,
        invoiceId: transaction.xenditInvoiceId,
        paymentUrl: transaction.paymentUrl,
        providerActions: transaction.providerActions,
      },
      'Pembayaran sudah diinisialisasi sebelumnya.',
    );
    return;
  }

  if (!transaction.orderId) {
    throw new AppError('Transaksi ini tidak terhubung ke pesanan.', 400);
  }

  const initialized = await orderService.initializePayment(
    transaction.orderId,
    transaction.userId,
    channelCode,
  );
  successResponse(res, initialized, 'Pembayaran berhasil diinisialisasi.');
});

/**
 * [ADMIN] Manually release Escrow to Supplier
 * In standard flow, Buyer triggers this from /orders/release-escrow/:id
 *
 * SEC-BE-020: pass actorRole='ADMIN' agar buyerId check di service di-bypass
 * (sebelumnya selalu 403 karena req.user.id = admin id, bukan buyer).
 */
export const releaseEscrow = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // Order ID
  const result = await walletService.releaseEscrow(id, req.user!.id, { actorRole: 'ADMIN' });
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
  if (!token) throw new AppError('Akses Ditolak: Token Callback Webhook Tidak Tersedia', 401);
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

  // SEC-BE-016: cap export ke 100 row max. Streaming/multi-page export bisa ditambah
  // di iterasi berikutnya jika dibutuhkan untuk supplier dengan riwayat besar.
  const requestedLimit = Math.min(
    Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1),
    100,
  );
  const result = await walletService.getWalletTransactions(userId, {
    page: 1,
    limit: requestedLimit,
  });
  const transactions = result.data;

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

  const rows = transactions.map((t) => ({
    ID: t.id,
    'Order No': t.order?.orderNumber || 'N/A',
    Amount: t.amount.toString(),
    'Platform Fee': t.platformFee.toString(),
    'Net Seller Amount': t.sellerAmount.toString(),
    Type: t.type,
    'Payment Status': t.paymentStatus || t.status,
    'Paid At': t.paidAt ? new Date(t.paidAt).toISOString() : '-',
    'Created At': new Date(t.createdAt).toISOString(),
  }));

  const csvContent = toCsv(headers, rows);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=BISA_B2B_Transactions_${new Date().toISOString().split('T')[0]}.csv`,
  );

  res.status(200).send(csvContent);
});
