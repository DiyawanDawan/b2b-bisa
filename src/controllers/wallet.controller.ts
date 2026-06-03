import { Response } from 'express';
import { AuthRequest, TransactionStatus, TransactionType } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import * as walletService from '#services/wallet.service';
import prisma from '#config/prisma';
import appError from '#utils/appError';

/**
 * [SUPPLIER] Get My Wallet Info & History
 */
export const getMyWallet = catchAsync(async (req: AuthRequest, res: Response) => {
  const wallet = await walletService.getMyWallet(req.user!.id);
  successResponse(res, wallet, 'Informasi Saldo Dompet Anda.');
});

/**
 * [ANY ROLE] Get Xendit Supported Payout Banks
 */
export const getSupportedBanks = catchAsync(async (_req: AuthRequest, res: Response) => {
  const banks = await walletService.getSupportedBanks();
  successResponse(res, banks, 'Daftar Bank Dukungan Pencairan Dana Xendit.');
});

/**
 * [SUPPLIER] Request Payout / Withdrawal
 */
export const withdrawBalance = catchAsync(async (req: AuthRequest, res: Response) => {
  const payout = await walletService.withdrawFunds(req.user!.id, req.body);
  createdResponse(
    res,
    payout,
    'Permintaan pencairan dana diproses. Menunggu konfirmasi Bank tujuan.',
  );
});

/**
 * [SUPPLIER] Get Wallet Transaction History
 */
export const getWalletHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page, limit, type, status, startDate, endDate } = req.query;
  const history = await walletService.getWalletTransactions(req.user!.id, {
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    type: type as TransactionType,
    status: status as TransactionStatus,
    startDate: startDate as string,
    endDate: endDate as string,
  });
  return paginatedResponse(
    res,
    history.data,
    history.meta.total,
    history.meta.page,
    history.meta.limit,
    'Riwayat transaksi dompet Anda.',
  );
});

/**
 * ==========================================
 * PAYOUT ACCOUNT MANAGEMENT (SUPPLIER)
 * ==========================================
 */

/**
 * List all bank accounts for the supplier
 */
export const listPayoutAccounts = catchAsync(async (req: AuthRequest, res: Response) => {
  const accounts = await prisma.userPayoutAccount.findMany({
    where: { userId: req.user!.id },
    select: {
      id: true,
      userId: true,
      bankId: true,
      accountNumber: true,
      accountName: true,
      isMain: true,
      createdAt: true,
      bank: {
        select: {
          id: true,
          name: true,
          code: true,
          logoUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  successResponse(res, accounts, 'Daftar rekening bank penarikan Anda.');
});

/**
 * Add a new bank account
 */
export const createPayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { bankId, accountNumber, accountName, isMain } = req.body;

  // Cek apakah bank valid
  const bank = await prisma.payoutBank.findUnique({ where: { id: bankId } });
  if (!bank) throw new appError('Bank tidak ditemukan atau tidak didukung.', 404);

  const account = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.userPayoutAccount.count({
      where: { userId: req.user!.id },
    });
    const shouldBeMain = isMain === true || existingCount === 0;

    if (shouldBeMain) {
      await tx.userPayoutAccount.updateMany({
        where: { userId: req.user!.id },
        data: { isMain: false },
      });
    }

    return tx.userPayoutAccount.create({
      data: {
        userId: req.user!.id,
        bankId,
        accountNumber,
        accountName,
        isMain: shouldBeMain,
      },
    });
  });

  createdResponse(res, account, 'Rekening bank berhasil didaftarkan.');
});

/**
 * Delete a bank account
 */
export const deletePayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const account = await prisma.userPayoutAccount.findUnique({ where: { id } });
  if (!account) throw new appError('Rekening tidak ditemukan.', 404);
  if (account.userId !== req.user!.id) throw new appError('Akses ditolak.', 403);

  await prisma.userPayoutAccount.delete({ where: { id } });

  successResponse(res, null, 'Rekening bank berhasil dihapus.');
});

/**
 * Update a bank account
 */
export const updatePayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { bankId, accountNumber, accountName, isMain } = req.body;

  const account = await prisma.userPayoutAccount.findUnique({ where: { id } });
  if (!account) throw new appError('Rekening tidak ditemukan.', 404);
  if (account.userId !== req.user!.id) throw new appError('Akses ditolak.', 403);

  const updatedAccount = await prisma.$transaction(async (tx) => {
    if (isMain) {
      await tx.userPayoutAccount.updateMany({
        where: { userId: req.user!.id },
        data: { isMain: false },
      });
    }

    return tx.userPayoutAccount.update({
      where: { id },
      data: {
        ...(bankId && { bankId }),
        ...(accountNumber && { accountNumber }),
        ...(accountName && { accountName }),
        ...(isMain !== undefined && { isMain }),
      },
    });
  });

  successResponse(res, updatedAccount, 'Rekening bank berhasil diperbarui.');
});

/**
 * Set a bank account as main
 */
export const setMainPayoutAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const account = await prisma.userPayoutAccount.findUnique({ where: { id } });
  if (!account) throw new appError('Rekening tidak ditemukan.', 404);
  if (account.userId !== req.user!.id) throw new appError('Akses ditolak.', 403);

  await prisma.$transaction(async (tx) => {
    // Reset all other accounts
    await tx.userPayoutAccount.updateMany({
      where: { userId: req.user!.id },
      data: { isMain: false },
    });

    // Set this one as main
    await tx.userPayoutAccount.update({
      where: { id },
      data: { isMain: true },
    });
  });

  successResponse(res, null, 'Rekening utama berhasil diperbarui.');
});
