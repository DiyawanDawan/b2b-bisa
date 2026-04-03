import { Router } from 'express';
import * as userController from '#controllers/user.controller';
import validate from '#middlewares/validate';
import { requireAuth, optionalAuth } from '#middlewares/authMiddleware';
import upload from '#middlewares/upload';
import * as v from '#validations/auth.validation';
import * as uv from '#validations/user.validation';
import * as verificationController from '#controllers/verification.controller';

const router = Router();

// /api/v1/users/:id (Public Profile)

// ─── Identity (Authenticated) ───────────────────────────

router.get('/me', requireAuth, userController.getMe);
router.patch(
  '/me',
  requireAuth,
  upload.single('avatar'),
  validate(v.updateProfileSchema),
  userController.updateProfile,
);

// Permintaan ganti nomor telepon
router.post(
  '/me/phone/request-update',
  requireAuth,
  validate(v.requestPhoneUpdateSchema),
  userController.requestPhoneUpdate,
);

// Verifikasi kode OTP untuk ganti nomor telepon
router.post(
  '/me/phone/verify-update',
  requireAuth,
  validate(v.verifyPhoneUpdateSchema),
  userController.verifyPhoneUpdate,
);

// Upload dokumen identitas (KTP, NIB, Selfie, SIUP)
router.post(
  '/me/verify',
  requireAuth,
  upload.fields([
    { name: 'ktp', maxCount: 1 },
    { name: 'nib', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'siup', maxCount: 1 },
  ]),
  validate(v.submitVerificationSchema),
  verificationController.submitVerification,
);

// ─── Addresses (Authenticated) ─────────────────────────

router.get('/me/addresses', requireAuth, userController.listAddresses);
router.post(
  '/me/addresses',
  requireAuth,
  validate(uv.createAddressSchema),
  userController.createAddress,
);
router.put(
  '/me/addresses/:id',
  requireAuth,
  validate(uv.updateAddressSchema),
  userController.updateAddress,
);
router.delete('/me/addresses/:id', requireAuth, userController.deleteAddress);

// ─── Operating Hours (Authenticated) ───────────────────

router.get('/me/operating-hours', requireAuth, userController.listOperatingHours);
router.put(
  '/me/operating-hours',
  requireAuth,
  validate(uv.updateOperatingHoursSchema),
  userController.updateOperatingHours,
);

// /api/v1/users/:id (Public Profile)
router.get('/:id', optionalAuth, userController.getUserById);

export default router;
