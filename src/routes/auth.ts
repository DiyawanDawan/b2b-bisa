import { Router } from 'express';
import * as authController from '#controllers/auth.controller';
import validate from '#middlewares/validate';
import { authLimiter } from '#middlewares/rateLimiter';
import { requireAuth } from '#middlewares/authMiddleware';
import * as v from '#validations/auth.validation';

const router = Router();

// ── Public Auth Endpoints ─────────────────────────────────────────────────────

// [authLimiter] 5 request/menit per IP
router.post('/login', authLimiter, validate(v.loginSchema), authController.login);

// Register tidak perlu authLimiter (globalLimiter 300 req/15 menit sudah cukup)
router.post(
  '/register/supplier',
  validate(v.registerSupplierSchema),
  authController.registerSupplier,
);
router.post('/register/buyer', validate(v.registerBuyerSchema), authController.registerBuyer);

// OTP Verifikasi Registrasi
router.post(
  '/verify-registration',
  validate(v.verifyRegistrationSchema),
  authController.verifyRegistration,
);

// ── Social Auth (Placeholder — belum diimplementasikan) ───────────────────────
// Social login melempar 501 Not Implemented di service layer, diberi authLimiter
// untuk mencegah probe/fuzzing endpoint
router.post('/google', authLimiter, validate(v.socialLoginSchema), authController.loginWithGoogle);
router.post(
  '/facebook',
  authLimiter,
  validate(v.socialLoginSchema),
  authController.loginWithFacebook,
);

// ── Token Management ──────────────────────────────────────────────────────────

router.post('/refresh-token', validate(v.refreshTokenSchema), authController.refreshToken);
router.post('/logout', requireAuth, authController.logout);

// ── Password Reset Flow ───────────────────────────────────────────────────────

// [authLimiter] Mencegah spam email reset password ke orang lain
router.post(
  '/forgot-password',
  authLimiter,
  validate(v.forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/verify-reset-code',
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

export default router;
