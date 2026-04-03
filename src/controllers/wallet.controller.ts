import { Response } from 'express';
import { AuthRequest } from '#types/index';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
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
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const history = await walletService.getWalletTransactions(req.user!.id, page, limit);
  successResponse(res, history, 'Riwayat transaksi dompet Anda.');
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
    include: { bank: true },
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

  const account = await prisma.userPayoutAccount.create({
    data: {
      userId: req.user!.id,
      bankId,
      accountNumber,
      accountName,
      isMain: isMain || false,
    },
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
