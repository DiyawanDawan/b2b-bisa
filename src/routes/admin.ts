import { Router } from 'express';
import { requireAuth, requireRole } from '#middlewares/authMiddleware';
import * as verificationController from '#controllers/verification.controller';
import { UserRole } from '#prisma';

const router = Router();

// Semua route admin wajib autentikasi dan role ADMIN
router.use(requireAuth, requireRole(UserRole.ADMIN));

// ── User Management ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/users
 * Daftar semua user (SUPPLIER, BUYER, ADMIN)
 */
router.get('/users', (_req, res) => {
  res.json({ message: 'List semua user - belum diimplementasikan' });
});

/**
 * PATCH /api/v1/admin/users/:id/status
 * Nonaktifkan / aktivasi akun user
 */
router.patch('/users/:id/status', (_req, res) => {
  res.json({ message: 'Update status user - belum diimplementasikan' });
});

// ── Identity Verification Management ─────────────────────────────────────────

/**
 * GET /api/v1/admin/verifications
 * Daftar pengajuan verifikasi identitas yang PENDING
 */
router.get('/verifications', verificationController.getPendingVerifications);

/**
 * PATCH /api/v1/admin/verifications/review
 * Setujui atau tolak pengajuan verifikasi identitas user
 * Body: { userId, status: 'VERIFIED' | 'REJECTED', rejectionReason? }
 */
router.patch('/verifications/review', verificationController.updateVerificationStatus);

// ── Transaction & Financial Management ───────────────────────────────────────

/**
 * GET /api/v1/admin/transactions
 * Seluruh data transaksi platform
 */
router.get('/transactions', (_req, res) => {
  res.json({ message: 'List semua transaksi - belum diimplementasikan' });
});

// ── Dashboard & Reports ───────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/dashboard
 * Statistik ringkas platform (total user, total transaksi, GMV, dll)
 */
router.get('/dashboard', (_req, res) => {
  res.json({ message: 'Statistik dashboard admin - belum diimplementasikan' });
});

/**
 * GET /api/v1/admin/reports
 * Laporan agregat (bisa filter by range tanggal)
 */
router.get('/reports', (_req, res) => {
  res.json({ message: 'Laporan agregat - belum diimplementasikan' });
});

export default router;
