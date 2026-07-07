import rateLimit from 'express-rate-limit';
import { NODE_ENV } from '#utils/env.util';
import type { Request } from 'express';

/**
 * NOTE: Semua limiter di-skip saat NODE_ENV=development untuk DX.
 * Pastikan NODE_ENV=production di deploy untuk enforcement.
 * Rate limiter store default = in-memory (cocok untuk single-instance MVP).
 * Untuk multi-instance, migrate ke Redis store (rate-limit-redis).
 */

/**
 * Composite key generator: userId (jika authenticated) + IP.
 * Mencegah user di NAT yang sama saling blokir, dan attacker dengan rotating IP
 * tetap dibatasi per akun.
 *
 * Penting: hanya efektif jika `requireAuth` dijalankan SEBELUM limiter.
 */
const compositeKey = (req: Request): string => {
  const uid = (req as Request & { user?: { id?: string } }).user?.id || 'anon';
  return `${uid}:${req.ip || 'unknown'}`;
};

const iotIngestKey = (req: Request): string => {
  const deviceToken = req.header('X-Device-Token')?.trim();
  if (deviceToken) {
    return `device:${deviceToken}`;
  }
  return `ip:${req.ip || 'unknown'}`;
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak permintaan, coba lagi setelah 15 menit',
    },
    data: null,
  },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak percobaan login, coba lagi setelah 1 menit',
    },
    data: null,
  },
});

/**
 * Financial operations limiter: Withdrawals, escrow release, payment init
 * Prevents rapid fund drainage if account is compromised.
 *
 * SEC-BE-015: composite key (userId+IP) — diterapkan saat requireAuth sudah jalan.
 */
export const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 financial operations per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: compositeKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak transaksi keuangan. Demi keamanan, coba lagi setelah 15 menit.',
    },
    data: null,
  },
});

/**
 * Admin action limiter: Dispute resolution, user management, payouts
 * Prevents admin panel abuse
 */
export const adminActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Max 50 admin actions per hour
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak aksi admin. Coba lagi setelah 1 jam.',
    },
    data: null,
  },
});

/**
 * Public API limiter for specific heavy or sensitive public routes
 * windowMs: 15 minutes, max: 100 requests
 */
export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak permintaan ke layanan ini. Coba lagi setelah 15 menit.',
    },
    data: null,
  },
});

/**
 * Register Email Check Limiter: Prevents email enumeration during registration
 * windowMs: 1 minute, max: 10 requests
 */
export const emailCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak pengecekan email. Coba lagi setelah 1 menit.',
    },
    data: null,
  },
});

/**
 * Webhook Limiter: Xendit invoice/payout/session webhooks.
 * SEC-BE-006: defense-in-depth on top of constant-time signature check.
 * 60 req/min per IP — Xendit retry policy max 3× dalam 1 jam, jadi 60/min lebih dari cukup.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => req.ip || 'unknown',
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Webhook rate limit exceeded.',
    },
    data: null,
  },
});

/**
 * Chatbot Limiter: AI chatbot (Gemini) per-user limit.
 * SEC-BE-007: prevent quota/biaya API abuse.
 */
export const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: compositeKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak pertanyaan ke AI. Coba lagi setelah 1 menit.',
    },
    data: null,
  },
});

/**
 * Register Limiter: pembatasan ketat untuk endpoint registrasi.
 * SEC-BE-008: cegah mass registration / DB bloat / email OTP bombing.
 * 3 req/jam per IP — cukup ketat tapi tetap memungkinkan retry sah.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => req.ip || 'unknown',
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak percobaan registrasi. Coba lagi setelah 1 jam.',
    },
    data: null,
  },
});

/**
 * Upload Limiter: generic file upload (system/upload).
 * SEC-BE-002 helper: per-user limit untuk hindari storage abuse.
 * 20 req/menit per user — cukup untuk batch upload foto produk.
 */
/**
 * Chunked media upload session init — 30 sesi/jam per user (bukan per chunk).
 */
export const mediaUploadInitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: compositeKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak sesi upload. Coba lagi nanti.',
    },
    data: null,
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: compositeKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak upload. Coba lagi setelah 1 menit.',
    },
    data: null,
  },
});

/**
 * Public Verify/Track Limiter: order verify & track endpoints (QR / logistik).
 * SEC-BE-014: cegah enumeration orderNumber.
 * 30 req/menit per IP — sah untuk pelanggan, ketat untuk bot.
 */
/**
 * IoT ingest: POST /iot/data — cegah flood telemetry dari device rusak.
 * 120 req/menit per device token (fallback IP jika header belum ada).
 */
export const iotIngestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: iotIngestKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak data sensor. Coba lagi setelah 1 menit.',
    },
    data: null,
  },
});

export const publicVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => req.ip || 'unknown',
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak permintaan verifikasi. Coba lagi setelah 1 menit.',
    },
    data: null,
  },
});
