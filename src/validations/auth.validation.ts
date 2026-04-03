import { z } from 'zod';
import { UserRole, TokenType } from '#prisma';

const registerableRoleSchema = z
  .nativeEnum(UserRole)
  .refine((role) => role !== UserRole.ADMIN, 'Role admin tidak valid untuk endpoint ini');

const otpTokenTypeSchema = z.union([
  z.literal(TokenType.EMAIL_VERIFICATION),
  z.literal(TokenType.RESET_PASSWORD),
]);

const legacyOtpTypeSchema = z
  .enum(['REGISTRATION', 'PASSWORD_RESET'])
  .transform((value) =>
    value === 'REGISTRATION' ? TokenType.EMAIL_VERIFICATION : TokenType.RESET_PASSWORD,
  );

const resendOtpTypeSchema = z.union([otpTokenTypeSchema, legacyOtpTypeSchema]);

const baseRegisterSchema = z.object({
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Format nomor telepon tidak valid')
    .optional(),
  province: z.string().min(1, 'Provinsi wajib diisi untuk keperluan logistik').optional(),
  regency: z.string().min(1, 'Kabupaten/Kota wajib diisi untuk keperluan logistik').optional(),
});

export const registerSupplierSchema = baseRegisterSchema.extend({
  role: z.literal(UserRole.SUPPLIER).default(UserRole.SUPPLIER),
});

export const registerBuyerSchema = baseRegisterSchema.extend({
  role: z.literal(UserRole.BUYER).default(UserRole.BUYER),
});

export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password tidak boleh kosong'),
});

export const verifyRegistrationSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Kode OTP harus 6 digit'),
});

export const socialLoginSchema = z.object({
  token: z.string().min(1, 'ID Token diperlukan'),
  role: registerableRoleSchema.optional(),
});

export const refreshTokenSchema = z.object({
  token: z.string().min(1, 'Refresh token diperlukan'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Format email tidak valid'),
});

export const verifyResetCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Kode OTP harus 6 digit'),
});

export const resetPasswordWithTokenSchema = z.object({
  password: z.string().min(8, 'Password baru minimal 8 karakter'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password baru minimal 8 karakter'),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().min(2).optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{10,15}$/, 'Format nomor telepon tidak valid')
      .optional(),
    province: z.string().optional(),
    regency: z.string().optional(),
    bio: z.string().optional(),
    // BUYER specific
    companyName: z.string().optional(),
    npwp: z.string().optional(),
    businessType: z.string().optional(),
  })
  .optional();

export const requestPhoneUpdateSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Format nomor telepon tidak valid'),
});

export const verifyPhoneUpdateSchema = z.object({
  code: z.string().length(6, 'Kode OTP harus 6 digit'),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Format nomor telepon tidak valid'),
});

// Schema ini hanya memvalidasi field opsional dari body.
// URL dokumen (ktpUrl, nibUrl, dll) TIDAK diisi oleh client secara langsung,
// melainkan di-generate oleh controller setelah file diupload ke cloud storage.
// Validasi keberadaan dokumen dilakukan di verification.service.ts.
export const submitVerificationSchema = z
  .object({
    businessName: z.string().min(2).optional(),
    taxId: z.string().optional(),
    businessAddress: z.string().optional(),
  })
  .optional();

export const resendOtpSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  type: resendOtpTypeSchema.default(TokenType.EMAIL_VERIFICATION),
});
