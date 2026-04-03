import { Router } from 'express';
import * as walletController from '#controllers/wallet.controller';
import validate from '#middlewares/validate';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as v from '#validations/finance.validation';
import { UserRole } from '#prisma';

const router = Router();

router.use(requireAuth);

/**
 * ==========================================
 * SUPPLIER WALLETS & EARNINGS
 * ==========================================
 */
// [SUPPLIER] View Balance
router.get('/me', requireRole(UserRole.SUPPLIER, UserRole.ADMIN), walletController.getMyWallet);

// [SUPPLIER] Wallet Transaction History (Riwayat Pemasukan & Penarikan)
router.get(
  '/transactions',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  walletController.getWalletHistory,
);

// [SUPPLIER] Request Fund Withdrawal to Bank
router.post(
  '/withdraw',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.withdrawRequestSchema),
  walletController.withdrawBalance,
);

/**
 * ==========================================
 * PAYOUT ACCOUNT MANAGEMENT (SUPPLIER)
 * ==========================================
 */
router.get(
  '/payout-accounts',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  walletController.listPayoutAccounts,
);

router.post(
  '/payout-accounts',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  validate(v.createPayoutAccountSchema),
  walletController.createPayoutAccount,
);

router.delete(
  '/payout-accounts/:id',
  requireRole(UserRole.SUPPLIER, UserRole.ADMIN),
  walletController.deletePayoutAccount,
);

/**
 * ==========================================
 * PAYOUT BANKS DICTIONARY
 * ==========================================
 */
// [BOTH] Get Supported Banks for Disbursement
router.get('/banks', walletController.getSupportedBanks);

export default router;
