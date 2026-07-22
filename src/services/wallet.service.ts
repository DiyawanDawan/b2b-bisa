import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { Prisma, TransactionStatus, OrderStatus, PaymentStatus, TransactionType } from '#prisma';
import { Xendit } from 'xendit-node';
import { withRetry } from '#utils/retry.util';
import { resolveXenditPayoutSecretKey } from '#utils/env.util';
import { notifyOrderStatusChange } from '#services/orderNotification.service';
import { scheduleSupplyDemandRefresh } from '#services/marketSupplyDemand.service';
import { revealAccountNumber } from '#utils/payoutAccount.util';
import { calculateWithdrawalFee } from '#utils/platformFee.util';

/**
 * 1. Release Escrow (Buyer Mengonfirmasi Penerimaan Barang)
 *
 * SEC-BE-003: Sebelumnya validasi status escrow dilakukan di LUAR transaction,
 * menyebabkan race condition — dua request paralel bisa lolos cek dan keduanya
 * meng-increment saldo supplier. Sekarang:
 *   1. Semua validasi & ownership check dilakukan di dalam $transaction.
 *   2. Isolation level Serializable agar dua tx paralel di-serialize secara DB.
 *   3. Idempotency guard: `transaction.updateMany` dengan filter `status: ESCROW_HELD`
 *      + cek `count` agar concurrent retry yang kalah race akan menerima 409.
 *   4. Retry policy untuk Prisma P2034 (serialization failure) — max 3x.
 */
export const releaseEscrow = async (
  orderId: string,
  buyerId: string,
  options: { actorRole?: 'ADMIN' | 'BUYER' | 'SUPPLIER' | string } = {},
) => {
  const { actorRole } = options;

  // Manual retry loop — hanya retry untuk Prisma P2034 (serialization conflict).
  // AppError (4xx/5xx business logic) dilempar langsung tanpa retry.
  const MAX_RETRIES = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              buyerId: true,
              sellerId: true,
              status: true,
              transaction: {
                select: { id: true, status: true, sellerAmount: true },
              },
            },
          });

          if (!order) throw new AppError('Kontrak Pesanan tidak ditemukan.', 404);

          // SEC-BE-020: izinkan ADMIN bypass untuk admin release escrow flow.
          if (order.buyerId !== buyerId && actorRole !== 'ADMIN') {
            throw new AppError(
              'Hanya pembeli atau admin yang bisa merilis escrow pesanan ini.',
              403,
            );
          }

          if (order.status !== OrderStatus.SHIPPED) {
            throw new AppError(
              'Barang harus berstatus SHIPPED sebelum mengonfirmasi penerimaan.',
              400,
            );
          }

          const transaction = order.transaction;
          if (!transaction) {
            throw new AppError('Dana escrow belum tersimpan untuk pesanan ini.', 400);
          }

          // Idempotency guard — hanya update jika masih ESCROW_HELD.
          const updateResult = await tx.transaction.updateMany({
            where: { id: transaction.id, status: TransactionStatus.ESCROW_HELD },
            data: {
              status: TransactionStatus.RELEASED,
              escrowReleasedAt: new Date(),
            },
          });

          if (updateResult.count === 0) {
            // Race lost — sudah dilepas oleh request paralel.
            throw new AppError('Dana escrow sudah dilepas sebelumnya. Mohon refresh halaman.', 409);
          }

          // Update Order => COMPLETED setelah guard transaction sukses.
          const completedOrder = await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.COMPLETED },
          });

          const netSellerAmount = transaction.sellerAmount;

          // Pessimistic lock row wallet sebelum increment (paranoid double-safety).
          await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${order.sellerId} FOR UPDATE`;

          const wallet = await tx.wallet.upsert({
            where: { userId: order.sellerId },
            create: {
              userId: order.sellerId,
              balance: netSellerAmount,
              totalEarned: netSellerAmount,
            },
            update: {
              balance: { increment: netSellerAmount },
              totalEarned: { increment: netSellerAmount },
            },
          });

          return { order: completedOrder, walletBalance: wallet.balance };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      );

      void notifyOrderStatusChange({
        buyerId: result.order.buyerId,
        sellerId: result.order.sellerId,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        status: 'COMPLETED',
      });

      scheduleSupplyDemandRefresh();

      return result;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      // Hanya retry serialization conflict; AppError + error lain dilempar langsung.
      if (err instanceof AppError || code !== 'P2034') throw err;
      // Backoff dengan jitter sebelum retry berikutnya
      const delay = 100 * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
};

/**
 * 2. Withdraw Funds / Payout (Supplier Mencairkan ke Bank)
 */
export const withdrawFunds = async (supplierId: string, data: { amount: number }) => {
  const amountToWithdraw = new Prisma.Decimal(data.amount);

  if (amountToWithdraw.lte(0)) throw new AppError('Jumlah penarikan tidak valid.', 400);

  const mainAccount = await prisma.userPayoutAccount.findFirst({
    where: { userId: supplierId, isMain: true },
    include: {
      bank: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          minAmount: true,
          maxAmount: true,
          currency: true,
        },
      },
    },
  });

  if (!mainAccount) {
    throw new AppError(
      'Rekening utama belum diatur. Tambahkan rekening dan jadikan utama di Pengaturan Rekening Pencairan.',
      400,
    );
  }

  const payoutBank = mainAccount.bank;
  if (!payoutBank || !payoutBank.isActive) {
    throw new AppError('Bank rekening utama tidak dikenali atau tidak didukung.', 400);
  }

  const bankCode = payoutBank.code;
  const accountNo = revealAccountNumber(mainAccount.accountNumber, {
    userId: supplierId,
    bankId: mainAccount.bankId,
  });
  const accountName = mainAccount.accountName;

  if (payoutBank.minAmount && amountToWithdraw.lt(payoutBank.minAmount)) {
    throw new AppError(
      `Minimal penarikan ${Number(payoutBank.minAmount)} ${payoutBank.currency || 'IDR'}.`,
      400,
    );
  }
  if (payoutBank.maxAmount && amountToWithdraw.gt(payoutBank.maxAmount)) {
    throw new AppError(
      `Maksimal penarikan ${Number(payoutBank.maxAmount)} ${payoutBank.currency || 'IDR'}.`,
      400,
    );
  }

  const { fee: withdrawalFee, feeLine } = await calculateWithdrawalFee(amountToWithdraw);
  const totalDebit = amountToWithdraw.add(withdrawalFee);
  const transferAmount = amountToWithdraw; // nominal ke rekening = permintaan user; fee dipotong dari saldo

  const payoutTrx = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${supplierId} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({ where: { userId: supplierId } });
    if (!wallet || wallet.balance.lt(totalDebit)) {
      throw new AppError(
        withdrawalFee.gt(0)
          ? `Saldo tidak cukup. Penarikan ${Number(amountToWithdraw)} + biaya ${Number(withdrawalFee)} = ${Number(totalDebit)}.`
          : 'Saldo di Dompet BISA tidak mencukupi atau Wallet tidak ditemukan.',
        400,
      );
    }

    await tx.wallet.update({
      where: { userId: supplierId },
      data: {
        balance: { decrement: totalDebit },
        totalWithdrawn: { increment: amountToWithdraw },
      },
    });

    return tx.transaction.create({
      data: {
        userId: supplierId,
        amount: transferAmount,
        platformFee: withdrawalFee,
        feeBreakdownSnapshot: feeLine ? [feeLine] : undefined,
        status: TransactionStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        type: TransactionType.PAYOUT,
        payoutAccountId: mainAccount.id,
        externalId: `WDL-${Date.now()}-${supplierId.substring(0, 4)}`,
      },
    });
  });

  // API Xendit Payout (DILUAR blok $transaction untuk mencegah Lock Timeout)
  try {
    const xenditKey = resolveXenditPayoutSecretKey();
    if (!xenditKey) {
      throw new AppError(
        'Xendit config missing: set XENDIT_PAYOUT_SECRET_KEY (or XENDIT_SECRET_KEY) in .env.',
        500,
      );
    }

    const xenditClient = new Xendit({ secretKey: xenditKey });

    await withRetry(() =>
      xenditClient.Payout.createPayout({
        idempotencyKey: `payout-${payoutTrx.id}`,
        data: {
          referenceId: payoutTrx.externalId!,
          amount: Number(transferAmount.toString()),
          currency: 'IDR',
          channelCode: bankCode,
          channelProperties: {
            accountHolderName: accountName,
            accountNumber: accountNo,
          },
        },
      }),
    );

    // Jika pemanggilan API sukses (tidak melempar error), biarkan status tetap PENDING
    // Status final (SUCCESS/FAILED) akan dikawal oleh Webhook Payout.
  } catch (error: any) {
    console.error('[XENDIT PAYOUT ERROR]', error);

    // KEMBALIKAN SALDO (REFUND) JIKA API GAGAL SEKETIKA (Immediate Failure)
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: supplierId },
        data: {
          balance: { increment: totalDebit },
          totalWithdrawn: { decrement: amountToWithdraw },
        },
      });

      await tx.transaction.update({
        where: { id: payoutTrx.id },
        data: {
          status: TransactionStatus.FAILED,
          paymentStatus: PaymentStatus.FAILED,
        },
      });
    });

    throw new AppError(
      `Gagal memproses penarikan ke bank: ${error?.message || 'Gangguan sistem Xendit'}`,
      502,
    );
  }

  return payoutTrx;
};

/**
 * 3. List Supported Payout Banks (Sinkronisasi Xendit LBU)
 */
export const getSupportedBanks = async () => {
  // xenditClient.Disbursement.getAvailableBanks()
  return prisma.payoutBank.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      channelType: true,
      currency: true,
      minAmount: true,
      maxAmount: true,
      logoUrl: true,
    },
    orderBy: [{ channelType: 'asc' }, { name: 'asc' }],
  });
};

/**
 * 4. Get My Wallet
 * Uses atomic upsert to prevent race condition when concurrent requests
 * attempt to create a wallet for the same user simultaneously.
 */
export const getMyWallet = async (userId: string) => {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {}, // No changes if wallet already exists
  });
};

/**
 * 5. Get Wallet Transaction History (Supplier)
 */
export const getWalletTransactions = async (
  userId: string,
  params: {
    page?: number;
    limit?: number;
    type?: TransactionType;
    status?: TransactionStatus;
    startDate?: string; // ISO String
    endDate?: string; // ISO String
  } = {},
) => {
  const { page = 1, limit = 20, type, status, startDate, endDate } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.TransactionWhereInput = {
    userId,
    ...(type && { type }),
    ...(status && { status }),
    ...((startDate || endDate) && {
      createdAt: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        amount: true,
        sellerAmount: true,
        platformFee: true,
        status: true,
        type: true,
        paymentStatus: true,
        externalId: true,
        paidAt: true,
        escrowReleasedAt: true,
        createdAt: true,
        order: {
          select: { orderNumber: true, totalAmount: true },
        },
        paymentChannel: {
          select: { name: true },
        },
        payoutAccount: {
          select: { accountName: true, bank: { select: { name: true } } },
        },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    data: transactions,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 6. Refund to Buyer (Admin / System - saat Order CANCELLED atau DISPUTED)
 * Dimigrasikan dari payout.service.ts agar semua logika finansial terpusat
 */
type EscrowOrderContext = {
  id: string;
  buyerId: string;
  sellerId: string;
  transaction: {
    id: string;
    status: TransactionStatus;
    sellerAmount: Prisma.Decimal;
    amount: Prisma.Decimal;
    paymentRequestId: string | null;
    xenditInvoiceId?: string | null;
    paymentStatus: PaymentStatus | null;
  } | null;
};

/** Release escrow to supplier wallet — used by admin dispute RELEASE resolution. */
export const executeDisputeReleaseInTx = async (
  tx: Prisma.TransactionClient,
  order: EscrowOrderContext,
) => {
  if (!order.transaction) {
    throw new AppError('Tidak ada transaksi escrow untuk pesanan ini.', 400);
  }

  const updateResult = await tx.transaction.updateMany({
    where: { id: order.transaction.id, status: TransactionStatus.ESCROW_HELD },
    data: {
      status: TransactionStatus.RELEASED,
      escrowReleasedAt: new Date(),
    },
  });

  if (updateResult.count === 0) {
    throw new AppError('Dana escrow sudah diproses sebelumnya.', 409);
  }

  const netSellerAmount = order.transaction.sellerAmount;
  if (Number(netSellerAmount) <= 0) {
    throw new AppError('Jumlah payout supplier tidak valid untuk release escrow.', 400);
  }

  await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${order.sellerId} FOR UPDATE`;

  const wallet = await tx.wallet.upsert({
    where: { userId: order.sellerId },
    create: {
      userId: order.sellerId,
      balance: netSellerAmount,
      totalEarned: netSellerAmount,
    },
    update: {
      balance: { increment: netSellerAmount },
      totalEarned: { increment: netSellerAmount },
    },
  });

  const completedOrder = await tx.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.COMPLETED },
  });

  return {
    order: completedOrder,
    walletBalance: wallet.balance,
    sellerAmount: netSellerAmount,
  };
};

/** Refund escrow — restore stock, credit buyer wallet, mark REFUNDED. */
export const executeDisputeRefundInTx = async (
  tx: Prisma.TransactionClient,
  order: EscrowOrderContext,
) => {
  if (!order.transaction) {
    throw new AppError('Tidak ada transaksi escrow untuk pesanan ini.', 400);
  }

  const refundAmount = order.transaction.amount;

  const updateResult = await tx.transaction.updateMany({
    where: { id: order.transaction.id, status: TransactionStatus.ESCROW_HELD },
    data: { status: TransactionStatus.REFUNDED },
  });

  if (updateResult.count === 0) {
    throw new AppError('Dana escrow sudah diproses sebelumnya.', 409);
  }

  await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${order.buyerId} FOR UPDATE`;

  await tx.wallet.upsert({
    where: { userId: order.buyerId },
    create: {
      userId: order.buyerId,
      balance: refundAmount,
      totalEarned: new Prisma.Decimal(0),
      totalWithdrawn: new Prisma.Decimal(0),
    },
    update: {
      balance: { increment: refundAmount },
    },
  });

  const orderItems = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: { productId: true, quantity: true },
  });

  for (const item of orderItems) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }

  await tx.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED },
  });

  return order.transaction;
};

export const attemptXenditRefundForTransaction = async (
  transaction: {
    paymentRequestId: string | null;
    xenditInvoiceId?: string | null;
    amount: Prisma.Decimal;
    paymentStatus: PaymentStatus | null;
  },
  reason: string,
) => {
  if (transaction.paymentStatus != null && transaction.paymentStatus !== PaymentStatus.SUCCESS) {
    return null;
  }

  const paymentId = transaction.paymentRequestId ?? transaction.xenditInvoiceId;
  if (!paymentId) {
    return null;
  }

  try {
    const { refundPayment } = await import('#config/xendit');
    const amount = Number(transaction.amount);
    return await refundPayment(paymentId, amount, reason);
  } catch (err) {
    console.error('[wallet] Xendit refund failed (buyer wallet already credited):', err);
    return null;
  }
};

export const refundToBuyer = async (transactionId: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { order: { select: { id: true, buyerId: true, sellerId: true } } },
  });

  if (!transaction || transaction.status !== TransactionStatus.ESCROW_HELD) {
    throw new AppError('Tidak ada dana escrow yang bisa direfund.', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    await executeDisputeRefundInTx(tx, {
      id: transaction.orderId!,
      buyerId: transaction.userId,
      sellerId: transaction.order?.sellerId ?? transaction.userId,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        sellerAmount: transaction.sellerAmount,
        amount: transaction.amount,
        paymentRequestId: transaction.paymentRequestId,
        xenditInvoiceId: transaction.xenditInvoiceId,
        paymentStatus: transaction.paymentStatus,
      },
    });

    return transaction;
  });

  void attemptXenditRefundForTransaction(result, 'DISPUTE_REFUND');

  return result;
};
