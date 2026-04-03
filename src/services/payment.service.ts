import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { OrderStatus, TransactionStatus, PaymentStatus, Prisma, TransactionType } from '#prisma';
import { SUBSCRIPTION_DURATION_DAYS } from '#utils/env.util';
import {
  XenditInvoiceStatus,
  XenditPayoutStatus,
  XenditPaymentRequestStatus,
  XenditWebhookPayload,
} from '#constants/xendit.constants';
/**
 * 1. Menangkap dan Memverifikasi Webhook Pembayaran dari Xendit Escrow
 */
export const handleXenditWebhook = async (
  payload: XenditWebhookPayload,
  verificationToken: string,
) => {
  // Verifikasi Tanda Tangan Webhook Xendit
  // Untuk Node v7 dan API Webhook Xendit standar, token dikirim via headers['x-callback-token']
  const trueToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (trueToken && verificationToken !== trueToken) {
    throw new AppError('Token Webhook tidak valid, indikasi serangan pemalsuan pembayaran.', 401);
  }

  // Payload biasa berisi: external_id, status (PAID/EXPIRED), amount, payment_method
  const { external_id, status } = payload;

  if (!external_id) {
    throw new AppError('Payload tidak memiliki external_id transaksi.', 400);
  }

  // Cari transaksi di database kita berdasarkan external_id khusus (TRX-B2B-XXXX)
  const transaction = await prisma.transaction.findUnique({
    where: { externalId: external_id },
    include: { order: true },
  });

  if (!transaction) {
    console.warn(`[XENDIT WEBHOOK] Transaksi dengan external_id ${external_id} tidak dikenali.`);
    return null;
  }

  // Idempotency Guard: Jika sudah diproses sebelumnya, skip (Xendit bisa kirim retry)
  if (
    transaction.status === TransactionStatus.ESCROW_HELD ||
    transaction.status === TransactionStatus.RELEASED
  ) {
    console.log(
      `[XENDIT WEBHOOK] Transaksi ${external_id} sudah diproses (${transaction.status}). Skip.`,
    );
    return transaction;
  }

  // Jika statusnya PAID
  if (status === XenditInvoiceStatus.PAID) {
    return prisma.$transaction(async (tx) => {
      // Verifikasi Nominal: Mencegah manipulasi jumlah bayar
      const paidAmount = new Prisma.Decimal(payload.amount || 0);
      if (!paidAmount.equals(transaction.amount)) {
        throw new AppError(
          `Nominal pembayaran tidak sesuai. Dibayar: ${paidAmount}, Seharusnya: ${transaction.amount}`,
          400,
        );
      }

      if (transaction.type === TransactionType.SUBSCRIPTION) {
        const updatedTrx = await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            paymentStatus: PaymentStatus.SUCCESS,
            status: TransactionStatus.RELEASED, // Langsung rilis tidak masuk Escrow
            paidAt: new Date(),
            providerActions: payload as Record<string, any>,
          },
        });

        // Extend subscription by 30 days
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + SUBSCRIPTION_DURATION_DAYS);

        await tx.user.update({
          where: { id: transaction.userId },
          data: { tier: 'PRO', subscriptionExpiresAt: limitDate },
        });

        return updatedTrx;
      } else {
        // Asumsi tipe transaksi = SALES (pembelian barang/order)
        if (!transaction.orderId) {
          throw new AppError('Transaksi tipe SALES tidak memiliki orderId', 400);
        }

        const updatedTrx = await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            paymentStatus: PaymentStatus.SUCCESS,
            status: TransactionStatus.ESCROW_HELD,
            paidAt: new Date(),
            providerActions: payload as Record<string, any>,
          },
        });

        // Update Order menjadi siap dikirim (PROCESSING)
        await tx.order.update({
          where: { id: transaction.orderId },
          data: { status: OrderStatus.PROCESSING },
        });

        // TODO: Emit Notification ke Supplier dan Buyer
        return updatedTrx;
      }
    });
  } else if (status === XenditInvoiceStatus.EXPIRED) {
    return prisma.$transaction(async (tx) => {
      if (transaction.type === TransactionType.SUBSCRIPTION) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { paymentStatus: PaymentStatus.EXPIRED, status: TransactionStatus.FAILED },
        });
      } else {
        if (!transaction.orderId) return null;
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { paymentStatus: PaymentStatus.EXPIRED, status: TransactionStatus.FAILED },
        });

        await tx.order.update({
          where: { id: transaction.orderId },
          data: { status: OrderStatus.CANCELLED },
        });
      }
      return tx.transaction.findUnique({ where: { id: transaction.id } });
    });
  }

  return transaction;
};

/**
 * 2. Menangkap Webhook Payout (Disbursement) dari Xendit
 * Dipanggil saat proses pencairan dana ke rekening bank selesai.
 */
export const handleXenditPayoutWebhook = async (
  payload: XenditWebhookPayload,
  verificationToken: string,
) => {
  const trueToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (trueToken && verificationToken !== trueToken) {
    throw new AppError('Token Webhook tidak valid.', 401);
  }

  const { reference_id, status } = payload;

  if (!reference_id) {
    throw new AppError('Payload tidak memiliki reference_id payout.', 400);
  }

  // Cari transaksi payout di database
  const transaction = await prisma.transaction.findUnique({
    where: { externalId: reference_id },
  });

  if (!transaction || transaction.type !== TransactionType.PAYOUT) {
    console.warn(`[XENDIT PAYOUT] Transaksi ${reference_id} tidak ditemukan.`);
    return null;
  }

  // Idempotency: Jika sudah diproses, abaikan
  if (
    transaction.status === TransactionStatus.RELEASED ||
    transaction.status === TransactionStatus.FAILED
  ) {
    return transaction;
  }

  // Status SUCCEEDED: Payout Berhasil
  if (status === XenditPayoutStatus.SUCCEEDED) {
    return prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.RELEASED,
        paymentStatus: PaymentStatus.SUCCESS,
        paidAt: new Date(),
      },
    });
  }

  // Status FAILED / VOIDED: Payout Gagal, Kembalikan Dana ke Wallet
  if (status === XenditPayoutStatus.FAILED || status === XenditPayoutStatus.VOIDED) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock Wallet Row
      await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${transaction.userId} FOR UPDATE`;

      // 2. Tandai Transaksi Gagal
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.FAILED, paymentStatus: PaymentStatus.FAILED },
      });

      // 3. Re-credit (Refund) ke Saldo Wallet
      return tx.wallet.update({
        where: { userId: transaction.userId },
        data: {
          balance: { increment: transaction.amount },
          totalWithdrawn: { decrement: transaction.amount },
        },
      });
    });
  }

  return transaction;
};

/**
 * 3. Menangkap Webhook Payment Request V3 (Modern)
 * Dipanggil saat pembayaran melalui Payment Session / Request berhasil.
 */
export const handleXenditPaymentRequestWebhook = async (
  payload: XenditWebhookPayload,
  verificationToken: string,
) => {
  const trueToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (trueToken && verificationToken !== trueToken) {
    throw new AppError('Token Webhook tidak valid.', 401);
  }

  // V3 menggunakan reference_id dan status (SUCCEEDED)
  const { reference_id, status } = payload;

  if (!reference_id) {
    throw new AppError('Payload tidak memiliki reference_id.', 400);
  }

  // Cari transaksi di database
  const transaction = await prisma.transaction.findUnique({
    where: { externalId: reference_id },
    include: { order: true },
  });

  if (!transaction) {
    console.warn(`[XENDIT V3 WEBHOOK] Transaksi ${reference_id} tidak dikenali.`);
    return null;
  }

  // Idempotency Guard
  if (
    transaction.status === TransactionStatus.ESCROW_HELD ||
    transaction.status === TransactionStatus.RELEASED
  ) {
    return transaction;
  }

  // Jika statusnya SUCCEEDED (V3 Standard)
  if (status === XenditPaymentRequestStatus.SUCCEEDED) {
    await prisma.$transaction(async (tx) => {
      // 1. Verifikasi Nominal V3
      const paidAmount = new Prisma.Decimal(payload.amount || 0);
      if (!paidAmount.equals(transaction.amount)) {
        throw new AppError(
          `Nominal pembayaran V3 tidak sesuai. Dibayar: ${paidAmount}, Seharusnya: ${transaction.amount}`,
          400,
        );
      }

      // 2. Update Transaction
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          paymentStatus: PaymentStatus.SUCCESS,
          status:
            transaction.type === TransactionType.SUBSCRIPTION
              ? TransactionStatus.RELEASED
              : TransactionStatus.ESCROW_HELD,
          paidAt: new Date(),
          providerActions: payload as Record<string, any>,
        },
      });

      // 3. Subscription Logic (Tier Upgrade + Stacking)
      if (transaction.type === TransactionType.SUBSCRIPTION && transaction.userId) {
        const user = await tx.user.findUnique({ where: { id: transaction.userId } });
        if (user) {
          const baseDate =
            user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()
              ? user.subscriptionExpiresAt
              : new Date();

          const nextExpiry = new Date(baseDate);
          nextExpiry.setDate(nextExpiry.getDate() + SUBSCRIPTION_DURATION_DAYS);

          await tx.user.update({
            where: { id: user.id },
            data: {
              tier: 'PRO',
              subscriptionExpiresAt: nextExpiry,
            },
          });
          console.log(`[SUBSCRIPTION] User ${user.email} upgraded to PRO until ${nextExpiry}`);
        }
      }

      // 4. Order Logic
      if (transaction.type === TransactionType.SALES && transaction.orderId) {
        await tx.order.update({
          where: { id: transaction.orderId },
          data: { status: OrderStatus.PROCESSING },
        });
      }
    });
  } else if (
    status === XenditPaymentRequestStatus.EXPIRED ||
    status === XenditPaymentRequestStatus.FAILED
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { paymentStatus: PaymentStatus.EXPIRED, status: TransactionStatus.FAILED },
      });

      if (transaction.orderId) {
        await tx.order.update({
          where: { id: transaction.orderId },
          data: { status: OrderStatus.CANCELLED },
        });
      }
    });
  }

  return transaction;
};

/**
 * 4. Mengambil Saluran Pembayaran (Payment Channels) Dinamis.
 * (Bisa dimirror dari Xendit SDK jika Secret ada, jika tidak pakai Fallback).
 */
export const getAvailableChannels = async () => {
  // Dalam real-world v7: xenditClient.PaymentMethod.getAll()
  // Data saluran kini ditarik dinamis dari pengaturan database
  return prisma.paymentChannel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true, group: true, logoUrl: true },
    orderBy: { name: 'asc' },
  });
};
