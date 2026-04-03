import prisma from '#config/prisma';
import AppError from '#utils/appError';
import { Prisma, TransactionStatus, OrderStatus, PaymentStatus, TransactionType } from '#prisma';
import { Xendit } from 'xendit-node';
import { withRetry } from '#utils/retry.util';

/**
 * 1. Release Escrow (Buyer Mengonfirmasi Penerimaan Barang)
 */
export const releaseEscrow = async (orderId: string, buyerId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { transaction: true },
  });

  if (!order) throw new AppError('Kontrak Pesanan tidak ditemukan.', 404);
  if (order.buyerId !== buyerId)
    throw new AppError('Hanya pembeli yang bisa merilis escrow pesanan ini.', 403);
  if (order.status !== OrderStatus.SHIPPED)
    throw new AppError('Barang harus berstatus SHIPPED sebelum mengonfirmasi penerimaan.', 400);

  const transaction = order.transaction;
  if (!transaction || transaction.status !== TransactionStatus.ESCROW_HELD) {
    throw new AppError('Dana escrow gagal divalidasi atau belum tersimpan penuh.', 400);
  }

  // Hitung ulang deposit
  const netSellerAmount = transaction.sellerAmount;

  const res = await prisma.$transaction(async (tx) => {
    // 1. Update Order => COMPLETED
    const completedOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.COMPLETED },
    });

    // 2. Update Transaction => RELEASED
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.RELEASED, escrowReleasedAt: new Date() },
    });

    // 3. Pesimistic Locking & Update Wallet Supplier
    // Kunci row wallet sebelum menambah saldo
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
  });

  // TODO: Send Notification to Supplier "Dana Rp X berhasil mendarat di dompet BISA Anda."
  return res;
};

/**
 * 2. Withdraw Funds / Payout (Supplier Mencairkan ke Bank)
 */
export const withdrawFunds = async (
  supplierId: string,
  data: { amount: number; bankCode: string; accountNo: string; accountName: string },
) => {
  const amountToWithdraw = new Prisma.Decimal(data.amount);

  if (amountToWithdraw.lte(0)) throw new AppError('Jumlah penarikan tidak valid.', 400);

  const payoutTrx = await prisma.$transaction(async (tx) => {
    // 1. Pesimistic Locking: Kunci Row Wallet agar tidak bisa dimanipulasi request lain
    // MySQL: SELECT * FROM wallets WHERE user_id = ? FOR UPDATE
    await tx.$queryRaw`SELECT * FROM wallets WHERE user_id = ${supplierId} FOR UPDATE`;

    const wallet = await tx.wallet.findUnique({ where: { userId: supplierId } });
    if (!wallet || wallet.balance.lt(amountToWithdraw)) {
      throw new AppError('Saldo di Dompet BISA tidak mencukupi atau Wallet tidak ditemukan.', 400);
    }

    // 2. Kurangi Saldo di Wallet
    await tx.wallet.update({
      where: { userId: supplierId },
      data: {
        balance: { decrement: amountToWithdraw },
        totalWithdrawn: { increment: amountToWithdraw },
      },
    });

    // 2. Upsert Rekening (PayoutAccount)
    const payoutBank = await tx.payoutBank.findUnique({ where: { code: data.bankCode } });
    if (!payoutBank) throw new AppError('Kode Bank tidak dikenali/didukung.', 400);

    const payoutAccount = await tx.userPayoutAccount.upsert({
      where: {
        userId_accountNumber_bankId: {
          userId: supplierId,
          accountNumber: data.accountNo,
          bankId: payoutBank.id,
        },
      },
      update: { accountName: data.accountName },
      create: {
        userId: supplierId,
        bankId: payoutBank.id,
        accountNumber: data.accountNo,
        accountName: data.accountName,
      },
    });

    // 3. Catat di Tabel Transaksi sebagai 'PAYOUT' dengan status PENDING
    return tx.transaction.create({
      data: {
        userId: supplierId,
        amount: amountToWithdraw,
        status: TransactionStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        type: TransactionType.PAYOUT,
        payoutAccountId: payoutAccount.id,
        externalId: `WDL-${Date.now()}-${supplierId.substring(0, 4)}`,
      },
    });
  });

  // 4. API Xendit Payout (DILUAR blok $transaction untuk mencegah Lock Timeout)
  try {
    const xenditKey = process.env.XENDIT_SECRET_KEY;
    if (!xenditKey) {
      throw new AppError('Xendit config missing: XENDIT_SECRET_KEY is required.', 500);
    }

    const xenditClient = new Xendit({ secretKey: xenditKey });

    await withRetry(() =>
      xenditClient.Payout.createPayout({
        idempotencyKey: `payout-${payoutTrx.id}`,
        data: {
          referenceId: payoutTrx.externalId!,
          amount: Number(amountToWithdraw.toString()),
          currency: 'IDR',
          channelCode: data.bankCode,
          channelProperties: {
            accountHolderName: data.accountName,
            accountNumber: data.accountNo,
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
          balance: { increment: amountToWithdraw },
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
    select: { id: true, name: true, code: true, logoUrl: true },
  });
};

/**
 * 4. Get My Wallet
 */
export const getMyWallet = async (userId: string) => {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId } });
  }
  return wallet;
};

/**
 * 5. Get Wallet Transaction History (Supplier)
 */
export const getWalletTransactions = async (
  userId: string,
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
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
      },
    }),
    prisma.transaction.count({ where: { userId } }),
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
export const refundToBuyer = async (transactionId: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction || transaction.status !== TransactionStatus.ESCROW_HELD) {
    throw new AppError('Tidak ada dana escrow yang bisa direfund.', 400);
  }

  return prisma.$transaction(async (tx) => {
    // Update status Order terkait menjadi CANCELLED jika belum
    if (transaction.orderId) {
      await tx.order.update({
        where: { id: transaction.orderId },
        data: { status: OrderStatus.CANCELLED },
      });
    }

    return tx.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.REFUNDED },
    });
  });
};
