import rateLimit from 'express-rate-limit';
import { NODE_ENV } from '#utils/env.util';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => NODE_ENV === 'development',
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
  message: { success: false, message: 'Terlalu banyak permintaan, coba lagi setelah 15 menit' },
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
  message: { success: false, message: 'Terlalu banyak percobaan login, coba lagi setelah 1 menit' },
});
