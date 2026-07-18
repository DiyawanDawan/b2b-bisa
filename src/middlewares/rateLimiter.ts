import rateLimit from 'express-rate-limit';
import { NODE_ENV, RELAX_RATE_LIMITS } from '#utils/env.util';
import type { Request } from 'express';

/**
 * Rate limit:
 * - Di-skip jika NODE_ENV !== production ATAU RELAX_RATE_LIMITS=true
 *   (default true — cocok pre-live / staging / hackathon).
 * - Set RELAX_RATE_LIMITS=false di env live sungguhan untuk enforcement ketat.
 * Store default = in-memory (single-instance MVP).
 */

const isProduction = NODE_ENV === 'production';
const relaxLimits = RELAX_RATE_LIMITS || !isProduction;

const skipRelaxed = (): boolean => relaxLimits;

const isSafeHttpMethod = (req: Request): boolean => {
  const method = req.method.toUpperCase();
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
};

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
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (relaxLimits) return true;
    const path = (req.originalUrl || req.url || req.path || '').split('?')[0];
    return path.startsWith('/api/v1/admin') || path.includes('/api/v1/admin');
  },
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
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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
 * Financial operations limiter: Withdrawals, escrow release, payment init.
 * GET/HEAD/OPTIONS di-skip — list pesanan / detail tidak boleh kena kuota.
 * Live ketat: 300 mutasi / menit. Pre-live: di-skip via RELAX_RATE_LIMITS.
 */
export const financialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (relaxLimits) return true;
    return isSafeHttpMethod(req);
  },
  keyGenerator: compositeKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak transaksi keuangan. Demi keamanan, coba lagi setelah 1 menit.',
    },
    data: null,
  },
});

/**
 * Admin write limiter: dispute resolve, KYC review, payouts, dll.
 * GET/HEAD/OPTIONS di-skip — jangan blok list/polling panel admin.
 */
export const adminActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (relaxLimits) return true;
    return isSafeHttpMethod(req);
  },
  keyGenerator: compositeKey,
  message: {
    meta: {
      success: false,
      status: 429,
      message: 'Terlalu banyak aksi admin. Coba lagi setelah 1 jam.',
    },
    data: null,
  },
});

export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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

export const emailCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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

export const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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

export const mediaUploadInitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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

export const iotIngestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRelaxed,
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
