import prisma from '#config/prisma';
import { CACHE_TTL } from '#constants/cache.constants';
import { cacheAside, cacheKeys } from '#utils/cache.util';
import AppError from '#utils/appError';
import { idrAmountsEqual } from '#utils/currency.util';
import crypto from 'crypto';
import {
  OrderStatus,
  TransactionStatus,
  PaymentStatus,
  Prisma,
  TransactionType,
  UserTier,
} from '#prisma';
import { SUBSCRIPTION_DURATION_DAYS } from '#utils/env.util';
import { sealProviderActions } from '#utils/encryption.util';
import { notifyOrderProcessingById } from '#services/orderNotification.service';
import {
  XenditInvoiceStatus,
  XenditPayoutStatus,
  XenditPaymentRequestStatus,
  XenditWebhookPayload,
  normalizeXenditWebhookPayload,
} from '#constants/xendit.constants';
import { parseCheckoutBatchIdFromExternalId } from '#constants/order.constants';

const applyBatchSiblingOrdersOnSuccess = async (
  tx: Prisma.TransactionClient,
  checkoutBatchId: string,
  leadOrderId: string,
  leadUserId: string,
  paidAt: Date,
) => {
  const siblings = await tx.order.findMany({
    where: {
      checkoutBatchId,
      buyerId: leadUserId,
      id: { not: leadOrderId },
    },
    select: {
      id: true,
      transaction: { select: { id: true } },
      items: { select: { productId: true } },
    },
  });

  for (const sibling of siblings) {
    if (sibling.transaction) {
      await tx.transaction.update({
        where: { id: sibling.transaction.id },
        data: {
          paymentStatus: PaymentStatus.SUCCESS,
          status: TransactionStatus.ESCROW_HELD,
          paidAt,
        },
      });
    }
    await tx.order.update({
      where: { id: sibling.id },
      data: { status: OrderStatus.PROCESSING },
    });
    await tx.shipmentTracking.updateMany({
      where: { orderId: sibling.id },
      data: { vesselName: 'Menunggu pengiriman' },
    });
    if (sibling.items.length > 0) {
      await tx.cartItem.deleteMany({
        where: {
          userId: leadUserId,
          productId: { in: sibling.items.map((i) => i.productId) },
        },
      });
    }
    console.log(
      `[XENDIT V3 WEBHOOK] Batch sibling order ${sibling.id} lunas → PROCESSING`,
    );
  }

  return siblings.map((s) => s.id);
};

const cancelBatchSiblingOrdersOnFailure = async (
  tx: Prisma.TransactionClient,
  checkoutBatchId: string,
  leadOrderId: string,
) => {
  const siblings = await tx.order.findMany({
    where: {
      checkoutBatchId,
      id: { not: leadOrderId },
      status: OrderStatus.PENDING,
    },
    select: {
      id: true,
      transaction: { select: { id: true } },
      items: { select: { productId: true, quantity: true } },
    },
  });

  for (const sibling of siblings) {
    if (sibling.transaction) {
      await tx.transaction.update({
        where: { id: sibling.transaction.id },
        data: {
          paymentStatus: PaymentStatus.EXPIRED,
          status: TransactionStatus.FAILED,
        },
      });
    }
    for (const item of sibling.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
    await tx.order.update({
      where: { id: sibling.id },
      data: { status: OrderStatus.CANCELLED },
    });
  }
};

/** Verifies x-callback-token header (exported for controller ack-only paths). */
export const verifyXenditWebhookToken = (verificationToken: string): void => {
  const trueToken = process.env.XENDIT_WEBHOOK_TOKEN?.trim();
  const incomingToken = verificationToken?.trim();

  if (!trueToken || trueToken === 'YOUR_WEBHOOK_VERIFICATION_TOKEN_HERE') {
    throw new AppError(
      'Webhook token Xendit belum dikonfigurasi. Set XENDIT_WEBHOOK_TOKEN di .env sama dengan token di Xendit Dashboard → Callbacks.',
      500,
    );
  }

  if (!incomingToken) {
    throw new AppError('Header x-callback-token tidak ditemukan pada request webhook.', 401);
  }

  // Constant-time comparison to prevent timing attacks on webhook verification
  const verificationBuffer = Buffer.from(incomingToken);
  const trueTokenBuffer = Buffer.from(trueToken);

  if (
    verificationBuffer.length !== trueTokenBuffer.length ||
    !crypto.timingSafeEqual(verificationBuffer, trueTokenBuffer)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[XENDIT WEBHOOK] Token tidak cocok. Pastikan XENDIT_WEBHOOK_TOKEN di Backend/.env = Verification Token di Xendit Dashboard (Settings → Developers → Callbacks), lalu restart backend.',
      );
    }
    throw new AppError('Token Webhook tidak valid, indikasi serangan pemalsuan pembayaran.', 401);
  }
};
/**
 * 1. Menangkap dan Memverifikasi Webhook Pembayaran dari Xendit Escrow
 * Uses database transaction with Serializable isolation level to prevent
 * race conditions when Xendit sends concurrent webhook retries.
 */
export const handleXenditWebhook = async (
  payload: XenditWebhookPayload,
  verificationToken: string,
) => {
  verifyXenditWebhookToken(verificationToken);

  const normalized = normalizeXenditWebhookPayload(payload);
  const { externalId, status, amount } = normalized;

  if (!externalId) {
    console.warn('[XENDIT WEBHOOK] Invoice payload tanpa external_id — skip.');
    return null;
  }

  // Wrap entire webhook processing in a transaction for idempotency
  let notifyProcessingOrderId: string | null = null;

  const result = await prisma.$transaction(
    async (tx) => {
      // Cari transaksi — external_id pembayaran gabungan: TRX-BISA-MCHK- (legacy: TRX-BATCH-, TRX-B2B-)
      const transaction = await tx.transaction.findUnique({
        where: { externalId: externalId },
      });

      if (!transaction) {
        console.warn(`[XENDIT WEBHOOK] Transaksi dengan external_id ${externalId} tidak dikenali.`);
        return null;
      }

      // Idempotency Guard: Jika sudah diproses sebelumnya, skip (Xendit bisa kirim retry)
      // This check is now INSIDE the transaction lock, preventing race conditions
      if (
        transaction.status === TransactionStatus.ESCROW_HELD ||
        transaction.status === TransactionStatus.RELEASED
      ) {
        console.log(
          `[XENDIT WEBHOOK] Transaksi ${externalId} sudah diproses (${transaction.status}). Skip.`,
        );
        return transaction;
      }

      // Jika statusnya PAID
      if (status === XenditInvoiceStatus.PAID) {
        // Verifikasi Nominal: Mencegah manipulasi jumlah bayar
        const paidAmount = new Prisma.Decimal(amount || 0);
        if (!idrAmountsEqual(paidAmount, transaction.amount)) {
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
              providerActions: sealProviderActions(payload),
            },
          });

          // Extend subscription by 30 days
          const limitDate = new Date();
          limitDate.setDate(limitDate.getDate() + SUBSCRIPTION_DURATION_DAYS);

          await tx.user.update({
            where: { id: transaction.userId },
            data: { tier: UserTier.PRO, subscriptionExpiresAt: limitDate },
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
              providerActions: sealProviderActions(payload),
            },
          });

          // Update Order menjadi siap dikirim (PROCESSING)
          await tx.order.update({
            where: { id: transaction.orderId },
            data: { status: OrderStatus.PROCESSING },
          });

          await tx.shipmentTracking.updateMany({
            where: { orderId: transaction.orderId },
            data: { vesselName: 'Menunggu pengiriman' },
          });

          notifyProcessingOrderId = transaction.orderId;

          const orderItems = await tx.orderItem.findMany({
            where: { orderId: transaction.orderId },
            select: { productId: true },
          });
          if (orderItems.length > 0) {
            await tx.cartItem.deleteMany({
              where: {
                userId: transaction.userId,
                productId: { in: orderItems.map((i) => i.productId) },
              },
            });
          }

          return updatedTrx;
        }
      } else if (status === XenditInvoiceStatus.EXPIRED) {
        if (transaction.type === TransactionType.SUBSCRIPTION) {
          return tx.transaction.update({
            where: { id: transaction.id },
            data: { paymentStatus: PaymentStatus.EXPIRED, status: TransactionStatus.FAILED },
          });
        } else {
          if (!transaction.orderId) return null;

          await tx.transaction.update({
            where: { id: transaction.id },
            data: { paymentStatus: PaymentStatus.EXPIRED, status: TransactionStatus.FAILED },
          });

          // BUG-H002: Restore stock yang sudah didecrement saat createContract
          const orderItems = await tx.orderItem.findMany({
            where: { orderId: transaction.orderId },
            select: { productId: true, quantity: true },
          });
          for (const item of orderItems) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }

          return tx.order.update({
            where: { id: transaction.orderId },
            data: { status: OrderStatus.CANCELLED },
          });
        }
      }

      return transaction;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  if (notifyProcessingOrderId) {
    void notifyOrderProcessingById(notifyProcessingOrderId);
  }

  return result;
};

/**
 * 2. Menangkap Webhook Payout (Disbursement) dari Xendit
 * Dipanggil saat proses pencairan dana ke rekening bank selesai.
 */
export const handleXenditPayoutWebhook = async (
  payload: XenditWebhookPayload,
  verificationToken: string,
) => {
  verifyXenditWebhookToken(verificationToken);

  const { externalId, status } = normalizeXenditWebhookPayload(payload);

  if (!externalId) {
    console.warn('[XENDIT PAYOUT] Payload tanpa reference_id — skip.');
    return null;
  }

  // Wrap entire payout webhook in Serializable transaction for idempotency
  return prisma.$transaction(
    async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { externalId: externalId },
      });

      if (!transaction || transaction.type !== TransactionType.PAYOUT) {
        console.warn(`[XENDIT PAYOUT] Transaksi ${externalId} tidak ditemukan.`);
        return null;
      }

      // Idempotency Guard (inside transaction lock)
      if (
        transaction.status === TransactionStatus.RELEASED ||
        transaction.status === TransactionStatus.FAILED
      ) {
        return transaction;
      }

      // Status SUCCEEDED: Payout Berhasil
      if (status === XenditPayoutStatus.SUCCEEDED) {
        return tx.transaction.update({
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
        // Lock Wallet Row inside this transaction
        await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${transaction.userId} FOR UPDATE`;

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: TransactionStatus.FAILED, paymentStatus: PaymentStatus.FAILED },
        });

        return tx.wallet.update({
          where: { userId: transaction.userId },
          data: {
            balance: { increment: transaction.amount },
            totalWithdrawn: { decrement: transaction.amount },
          },
        });
      }

      return transaction;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
};

/**
 * 3. Menangkap Webhook Payment Request V3 (Modern)
 * Uses database transaction for idempotency against concurrent webhook retries.
 */
export const handleXenditPaymentRequestWebhook = async (
  payload: XenditWebhookPayload,
  verificationToken: string,
) => {
  verifyXenditWebhookToken(verificationToken);

  const normalized = normalizeXenditWebhookPayload(payload);
  const { externalId, status, amount } = normalized;

  if (!externalId) {
    console.warn('[XENDIT V3 WEBHOOK] Payload tanpa reference_id — skip.');
    return null;
  }

  // Wrap in transaction for idempotency
  let notifyProcessingOrderId: string | null = null;
  const notifyBatchOrderIds: string[] = [];

  const v3Result = await prisma.$transaction(
    async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { externalId: externalId },
      });

      if (!transaction) {
        console.warn(`[XENDIT V3 WEBHOOK] Transaksi ${externalId} tidak dikenali.`);
        return null;
      }

      // Idempotency Guard (inside transaction lock)
      if (
        transaction.status === TransactionStatus.ESCROW_HELD ||
        transaction.status === TransactionStatus.RELEASED
      ) {
        return transaction;
      }

      // Jika statusnya SUCCEEDED (V3 Standard)
      if (status === XenditPaymentRequestStatus.SUCCEEDED) {
        // Verifikasi Nominal V3
        const paidAmount = new Prisma.Decimal(amount || 0);
        if (!idrAmountsEqual(paidAmount, transaction.amount)) {
          throw new AppError(
            `Nominal pembayaran V3 tidak sesuai. Dibayar: ${paidAmount}, Seharusnya: ${transaction.amount}`,
            400,
          );
        }

        // Update Transaction
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            paymentStatus: PaymentStatus.SUCCESS,
            status:
              transaction.type === TransactionType.SUBSCRIPTION
                ? TransactionStatus.RELEASED
                : TransactionStatus.ESCROW_HELD,
            paidAt: new Date(),
            providerActions: sealProviderActions(payload),
          },
        });

        // Subscription Logic (Tier Upgrade + Stacking)
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
                tier: UserTier.PRO,
                subscriptionExpiresAt: nextExpiry,
              },
            });
            console.log(`[SUBSCRIPTION] User ${user.email} upgraded to PRO until ${nextExpiry}`);
          }
        }

        // Order Logic
        if (transaction.type === TransactionType.SALES && transaction.orderId) {
          const paidAt = new Date();
          await tx.order.update({
            where: { id: transaction.orderId },
            data: { status: OrderStatus.PROCESSING },
          });
          await tx.shipmentTracking.updateMany({
            where: { orderId: transaction.orderId },
            data: { vesselName: 'Menunggu pengiriman' },
          });
          notifyProcessingOrderId = transaction.orderId;
          const orderItems = await tx.orderItem.findMany({
            where: { orderId: transaction.orderId },
            select: { productId: true },
          });
          if (orderItems.length > 0) {
            await tx.cartItem.deleteMany({
              where: {
                userId: transaction.userId,
                productId: { in: orderItems.map((i) => i.productId) },
              },
            });
          }
          console.log(
            `[XENDIT V3 WEBHOOK] Order ${transaction.orderId} lunas → PROCESSING (reference=${externalId})`,
          );

          const checkoutBatchId = parseCheckoutBatchIdFromExternalId(externalId);
          if (checkoutBatchId) {
            const siblingIds = await applyBatchSiblingOrdersOnSuccess(
              tx,
              checkoutBatchId,
              transaction.orderId,
              transaction.userId,
              paidAt,
            );
            notifyBatchOrderIds.push(...siblingIds);
          }
        }

        return transaction;
      } else if (
        status === XenditPaymentRequestStatus.EXPIRED ||
        status === XenditPaymentRequestStatus.FAILED
      ) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { paymentStatus: PaymentStatus.EXPIRED, status: TransactionStatus.FAILED },
        });

        if (transaction.orderId) {
          // BUG-H002: Restore stock yang sudah didecrement saat createContract
          const orderItems = await tx.orderItem.findMany({
            where: { orderId: transaction.orderId },
            select: { productId: true, quantity: true },
          });
          for (const item of orderItems) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }

          await tx.order.update({
            where: { id: transaction.orderId },
            data: { status: OrderStatus.CANCELLED },
          });

          const failedBatchId = parseCheckoutBatchIdFromExternalId(externalId);
          if (failedBatchId) {
            await cancelBatchSiblingOrdersOnFailure(tx, failedBatchId, transaction.orderId);
          }
        }

        return transaction;
      }

      return transaction;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  if (notifyProcessingOrderId) {
    void notifyOrderProcessingById(notifyProcessingOrderId);
    const paidOrder = await prisma.transaction.findFirst({
      where: { orderId: notifyProcessingOrderId, paymentStatus: PaymentStatus.SUCCESS },
      select: { userId: true, orderId: true },
    });
    if (paidOrder?.userId && paidOrder.orderId) {
      const { creditReferralOnFirstPaidOrder } = await import('#services/referral.service');
      void creditReferralOnFirstPaidOrder(paidOrder.orderId, paidOrder.userId).catch((err) =>
        console.error('[REFERRAL] credit failed', err),
      );
    }
  }
  for (const batchOrderId of notifyBatchOrderIds) {
    void notifyOrderProcessingById(batchOrderId);
  }

  return v3Result;
};

/**
 * 4. Mengambil Saluran Pembayaran (Payment Channels) Dinamis.
 * (Bisa dimirror dari Xendit SDK jika Secret ada, jika tidak pakai Fallback).
 */
export const getAvailableChannels = async () =>
  cacheAside(cacheKeys.payChannels(), CACHE_TTL.PAY_CHANNELS, () =>
    prisma.paymentChannel.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        group: true,
        country: true,
        currency: true,
        minAmount: true,
        maxAmount: true,
        settlementTime: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    }),
  );
