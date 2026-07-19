import { Router } from 'express';
import * as authController from '#controllers/auth.controller';
import validate from '#middlewares/validate';
import { authLimiter, emailCheckLimiter, registerLimiter } from '#middlewares/rateLimiter';
import { requireAuth } from '#middlewares/authMiddleware';
import * as v from '#validations/auth.validation';

const router = Router();

// ── Public Auth Endpoints ─────────────────────────────────────────────────────

// Email availability check (must be before requireAuth if added later)
router.get(
  '/check-email',
  emailCheckLimiter,
  validate(v.checkEmailSchema, 'query'),
  authController.checkEmail,
);

// [authLimiter] 5 request/menit per IP
router.post('/login', authLimiter, validate(v.loginSchema), authController.login);

// SEC-BE-008: registerLimiter 3 req/jam per IP — cegah mass registration/email bombing.
// authLimiter mount-wide (di index.ts) tetap berlaku sebagai defense-in-depth.
router.post(
  '/register/supplier',
  registerLimiter,
  validate(v.registerSupplierSchema),
  authController.registerSupplier,
);
router.post(
  '/register/buyer',
  registerLimiter,
  validate(v.registerBuyerSchema),
  authController.registerBuyer,
);

// OTP Verifikasi Registrasi
// SEC-BE-004: authLimiter explicit + TODO per-email throttle (lihat auth.service.ts).
router.post(
  '/verify-registration',
  authLimiter,
  validate(v.verifyRegistrationSchema),
  authController.verifyRegistration,
);

// ── Token Management ──────────────────────────────────────────────────────────

// SEC-BE-018: authLimiter sebagai defense-in-depth meski refresh token 128-hex (entropy aman).
router.post(
  '/refresh-token',
  authLimiter,
  validate(v.refreshTokenSchema),
  authController.refreshToken,
);
router.post('/logout', requireAuth, authController.logout);

// ── Password Reset Flow ───────────────────────────────────────────────────────

// [authLimiter] Mencegah spam email reset password ke orang lain
router.post(
  '/forgot-password',
  authLimiter,
  validate(v.forgotPasswordSchema),
  authController.forgotPassword,
);
// SEC-BE-004: OTP verify — authLimiter + service-level per-email lockout (lihat auth.service.ts).
router.post(
  '/verify-reset-code',
  authLimiter,
  validate(v.verifyResetCodeSchema),
  authController.verifyResetCode,
);
router.post(
  '/reset-password/:token',
  validate(v.resetPasswordWithTokenSchema),
  authController.resetPasswordWithToken,
);

// Reset password via authenticated session (sudah login tapi mau ganti password)
// validate() ditambahkan — sebelumnya MISSING, bisa kirim password kosong!
router.post(
  '/reset-password',
  requireAuth,
  validate(v.resetPasswordSchema),
  authController.resetPassword,
);

// ── OTP Resend ────────────────────────────────────────────────────────────────

// [authLimiter] Mencegah spam kirim OTP berulang-ulang
router.post('/resend-otp', authLimiter, validate(v.resendOtpSchema), authController.resendOTP);

// ── Social Auth ─────────────────────────────────────────────────────────────
// Google: Firebase ID token (preferensi) atau Google OAuth ID token.
// Facebook: Firebase ID token (OAuth redirect → /__/auth/handler).
router.post('/google', authLimiter, validate(v.socialLoginSchema), authController.loginWithGoogle);
router.post(
  '/facebook',
  authLimiter,
  validate(v.socialLoginSchema),
  authController.loginWithFacebook,
);

export default router;
