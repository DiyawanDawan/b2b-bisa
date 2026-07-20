import bcrypt from 'bcrypt';
import { addMinutes } from 'date-fns';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { TokenType, UserStatus, UserRole, Prisma } from '#prisma';
import prisma from '#config/prisma';
import admin from '#config/firebase';
import AppError from '#utils/appError';
import * as tokenService from '#services/token.service';
import { GOOGLE_WEB_CLIENT_ID } from '#utils/env.util';

import * as emailService from '#services/email.service';
import { decryptField, encryptField, isEncryptedPayload } from '#utils/encryption.util';
import { maskNPWP } from '#utils/sensitiveData.util';

const BCRYPT_ROUNDS = 12;

type ResendOtpType = typeof TokenType.EMAIL_VERIFICATION | typeof TokenType.RESET_PASSWORD;

type SocialIdentity = {
  email: string;
  name?: string;
  picture?: string;
};

const sealNpwp = (npwp: string): string => encryptField(npwp.trim());

const revealNpwp = (stored?: string | null): string => {
  if (!stored) return '';
  if (isEncryptedPayload(stored)) return decryptField(stored);
  return stored;
};

const identityFromFirebaseDecoded = (decoded: {
  email?: string;
  name?: string;
  picture?: string;
}): SocialIdentity => {
  if (!decoded.email) {
    throw new AppError(
      'Akun sosial tidak menyediakan email. Izinkan akses email di Facebook/Google lalu coba lagi.',
      400,
    );
  }
  return {
    email: decoded.email,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
    picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
  };
};

/**
 * Firebase Auth ID token (Google / Facebook via `signInWithCredential` atau `signInWithProvider`).
 * Redirect OAuth web: https://bisa-51853.firebaseapp.com/__/auth/handler
 */
const verifyFirebaseIdentity = async (idToken: string): Promise<SocialIdentity> => {
  if (!admin.apps.length) {
    throw new AppError(
      'Login sosial belum tersedia di server (Firebase Admin). Hubungi admin.',
      503,
    );
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return identityFromFirebaseDecoded(decoded);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Verifikasi token Firebase gagal: ${(error as Error).message}`, 401);
  }
};

const looksLikeJwt = (token: string) => token.split('.').length === 3;

/**
 * Facebook access token (SDK) → Graph API /me.
 * Dipakai bila mobile mengirim access token mentah (bukan Firebase ID token).
 */
const verifyFacebookGraphIdentity = async (accessToken: string): Promise<SocialIdentity> => {
  try {
    const url = new URL('https://graph.facebook.com/v21.0/me');
    url.searchParams.set('fields', 'id,name,email,picture.type(large)');
    url.searchParams.set('access_token', accessToken);

    const res = await fetch(url);
    const body = (await res.json()) as {
      id?: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string } };
      error?: { message?: string };
    };

    if (!res.ok || body.error) {
      throw new AppError(
        `Verifikasi Facebook gagal: ${body.error?.message ?? res.statusText}`,
        401,
      );
    }

    if (!body.email) {
      throw new AppError(
        'Akun Facebook tidak menyediakan email. Izinkan akses email lalu coba lagi.',
        400,
      );
    }

    return {
      email: body.email,
      name: body.name,
      picture: body.picture?.data?.url,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Verifikasi token Facebook gagal: ${(error as Error).message}`, 401);
  }
};

const verifyFacebookIdentity = async (token: string): Promise<SocialIdentity> => {
  if (looksLikeJwt(token) && admin.apps.length) {
    try {
      return await verifyFirebaseIdentity(token);
    } catch {
      // Bukan Firebase token valid — coba Graph API di bawah.
    }
  }
  return verifyFacebookGraphIdentity(token);
};

/**
 * Terima Firebase Auth ID token (preferensi) ATAU Google OAuth ID token mentah.
 * Mobile mengirim Firebase token setelah `signInWithCredential`.
 */
const verifyGoogleIdentity = async (idToken: string): Promise<SocialIdentity> => {
  if (admin.apps.length) {
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      if (decoded.email) {
        return identityFromFirebaseDecoded(decoded);
      }
    } catch {
      // Bukan Firebase token — coba verifikasi Google OAuth di bawah.
    }
  }

  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new AppError(
      'Login Google belum tersedia di server. Gunakan email/password atau hubungi admin.',
      503,
    );
  }

  try {
    const client = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_WEB_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new AppError('Google login tidak menyediakan email.', 400);
    }
    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`Verifikasi token Google gagal: ${(error as Error).message}`, 401);
  }
};

// ─── Register ────────────────────────────────────────────
export const register = async (userData: {
  fullName: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'SUPPLIER' | 'BUYER';
  province?: string;
  regency?: string;
  referralCode?: string;
}) => {
  const { fullName, email, password, phone, role, province, regency, referralCode } = userData;

  // Check if user exists
  const orConditions: Prisma.UserWhereInput[] = [{ email }];
  if (phone) orConditions.push({ phone });

  const existingUser = await prisma.user.findFirst({
    where: { OR: orConditions },
  });
  if (existingUser) throw new AppError('Email atau nomor telepon sudah terdaftar', 400);

  // Hash password

  const hashedPassword = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : undefined;

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      password: hashedPassword,
      phone,
      role,
      province,
      regency,
    },
  });

  if (referralCode) {
    const { applyReferralOnRegister } = await import('#services/referral.service');
    await applyReferralOnRegister(user.id, referralCode);
  }

  const otp = await tokenService.generateOtp(user.id, TokenType.EMAIL_VERIFICATION);
  await emailService.sendOtpEmail(user.email, user.fullName, otp);
  return { id: user.id, email: user.email, role: user.role };
};

// ─── Verify OTP ──────────────────────────────────────────
export const verifyRegistration = async (email: string, code: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('User tidak ditemukan.', 404);
  if (user.isEmailVerified) throw new AppError('Email sudah diverifikasi.', 400);

  const valid = await tokenService.verifyOtp(user.id, code, TokenType.EMAIL_VERIFICATION);
  if (!valid) throw new AppError('Kode OTP tidak valid atau sudah expired.', 400);

  await prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true } });
  return { message: 'Email berhasil diverifikasi.' };
};

// ─── Login ───────────────────────────────────────────────
export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) throw new AppError('Email atau password salah.', 401);
  if (!user.isEmailVerified)
    throw new AppError('Email belum diverifikasi. Periksa email Anda.', 403);
  if (user.status !== UserStatus.ACTIVE)
    throw new AppError('Akun Anda telah dinonaktifkan atau diblokir. Hubungi admin.', 403);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new AppError('Email atau password salah.', 401);

  const accessToken = tokenService.generateAccessToken(user.id, user.role);
  const refreshTokenValue = await tokenService.generateRefreshToken(user.id);

  return {
    token: { accessToken, refreshToken: refreshTokenValue },
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      tier: user.tier,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      avatarUrl: user.avatarUrl,
      province: user.province,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    },
  };
};

// ─── Social Login ────────────────────────────────────────
export const loginWithSocial = async (
  provider: 'google' | 'facebook',
  idToken: string,
  role?: UserRole,
) => {
  if (provider === 'facebook' && !admin.apps.length) {
    // Graph API fallback masih bisa jalan tanpa Firebase Admin.
  }
  if (provider === 'google' && !admin.apps.length && !GOOGLE_WEB_CLIENT_ID) {
    throw new AppError(
      'Login Google belum tersedia di server. Gunakan email/password atau hubungi admin.',
      503,
    );
  }

  try {
    const { email, name, picture } =
      provider === 'facebook'
        ? await verifyFacebookIdentity(idToken)
        : await verifyGoogleIdentity(idToken);

    // Find user by email
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create a new user if not exists
      user = await prisma.user.create({
        data: {
          email,
          fullName: name || 'User',
          avatarUrl: picture || null,
          role: role || UserRole.BUYER,
          isEmailVerified: true,
          status: UserStatus.ACTIVE,
        },
      });
    } else {
      // If user exists but email is not verified, verify it
      if (!user.isEmailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isEmailVerified: true },
        });
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw new AppError('Akun Anda telah dinonaktifkan atau diblokir. Hubungi admin.', 403);
      }
    }

    const accessToken = tokenService.generateAccessToken(user.id, user.role);
    const refreshTokenValue = await tokenService.generateRefreshToken(user.id);

    return {
      token: { accessToken, refreshToken: refreshTokenValue },
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        province: user.province,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Verifikasi token ${provider === 'facebook' ? 'Facebook' : 'Google'} gagal: ${(error as Error).message}`,
      401,
    );
  }
};

// ─── Logout ──────────────────────────────────────────────
export const logoutUser = async (userId: string, refreshToken?: string) => {
  if (refreshToken) {
    // Revoke token spesifik (logout 1 device)
    await prisma.token.deleteMany({
      where: { token: refreshToken, userId, type: TokenType.REFRESH },
    });
  } else {
    // Revoke semua refresh token milik user (logout semua device)
    await prisma.token.deleteMany({ where: { userId, type: TokenType.REFRESH } });
  }
};

export const refreshToken = async (token: string) => {
  const record = await tokenService.verifyRefreshToken(token);
  if (!record) throw new AppError('Refresh token tidak valid atau sudah expired.', 401);
  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) throw new AppError('User tidak ditemukan.', 401);

  // Token Rotation: Revoke old token & issue new pair
  await tokenService.revokeRefreshToken(token);
  const accessToken = tokenService.generateAccessToken(user.id, user.role);
  const newRefreshToken = await tokenService.generateRefreshToken(user.id);

  return { accessToken, refreshToken: newRefreshToken };
};

// ─── Password Reset ──────────────────────────────────────
export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const otp = await tokenService.generateOtp(user.id, TokenType.RESET_PASSWORD);
  await emailService.sendPasswordResetEmail(user.email, user.fullName, otp);
};

/**
 * SEC-BE-013: hindari user enumeration. Sebelumnya 404 ('User tidak ditemukan')
 * vs 400 ('Kode OTP tidak valid') membedakan email valid vs invalid.
 *
 * Sekarang: pesan generik "Kode OTP tidak valid atau sudah expired" untuk semua
 * kasus gagal, sehingga attacker tidak bisa membedakan email terdaftar vs tidak.
 */
export const verifyResetCode = async (email: string, code: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  const generic = new AppError('Kode OTP tidak valid atau sudah expired.', 400);

  if (!user) throw generic;

  const valid = await tokenService.verifyOtp(user.id, code, TokenType.RESET_PASSWORD);
  if (!valid) throw generic;

  // Buat token reset yang pendek (30 menit) dengan type RESET_PASSWORD, bukan REFRESH
  const resetToken = crypto.randomBytes(32).toString('hex');
  await prisma.token.create({
    data: {
      userId: user.id,
      token: resetToken,
      type: TokenType.RESET_PASSWORD,
      expiresAt: addMinutes(new Date(), 30),
    },
  });
  return { resetToken };
};

export const resetPasswordWithToken = async (token: string, password: string) => {
  // Cari token dengan type RESET_PASSWORD (bukan REFRESH)
  const record = await prisma.token.findFirst({
    where: { token, type: TokenType.RESET_PASSWORD },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError('Token reset tidak valid atau sudah kedaluwarsa.', 400);
  }

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });

  // Hapus token setelah dipakai (one-time use)
  await prisma.token.delete({ where: { id: record.id } });
};

export const resetPassword = async (userId: string, password: string) => {
  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
};

// ─── Profile ─────────────────────────────────────────────
export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      tier: true,
      subscriptionExpiresAt: true,
      phone: true,
      avatarUrl: true,
      province: true,
      regency: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      status: true,
      enableNotifications: true,
      // Profile: hanya field yang relevan untuk UI
      profile: {
        select: {
          bio: true,
          website: true,
          companyName: true,
          npwp: true,
          businessType: true,
          rajaongkirOriginId: true,
          rajaongkirOriginLabel: true,
        },
      },
      // Verification: hanya status, bukan seluruh dokumen URL
      verification: {
        select: {
          verificationStatus: true,
          isVerified: true,
          rejectionReason: true,
          reviewedAt: true,
        },
      },
      createdAt: true,
    },
  });

  if (user?.profile?.npwp) {
    user.profile.npwp = maskNPWP(revealNpwp(user.profile.npwp));
  }

  return user;
};

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  province?: string;
  regency?: string;
  bio?: string;
  companyName?: string;
  npwp?: string;
  businessType?: string;
  rajaongkirOriginId?: number;
  rajaongkirOriginLabel?: string;
  enableNotifications?: boolean;
}

export const updateProfile = async (userId: string, data: UpdateProfileInput) => {
  const {
    fullName,
    phone,
    avatarUrl,
    province,
    regency,
    bio,
    companyName,
    npwp,
    businessType,
    rajaongkirOriginId,
    rajaongkirOriginLabel,
    enableNotifications,
  } = data;

  const userUpdate: Record<string, unknown> = {};
  if (fullName) userUpdate.fullName = fullName;
  if (phone) userUpdate.phone = phone;
  if (avatarUrl) userUpdate.avatarUrl = avatarUrl;
  if (province) userUpdate.province = province;
  if (regency) userUpdate.regency = regency;
  if (enableNotifications !== undefined) {
    userUpdate.enableNotifications = enableNotifications;
  }

  // Profile fields: Only include if explicitly defined to avoid overwriting existing data with null
  const profileData: Record<string, unknown> = {};
  if (bio !== undefined) profileData.bio = bio;
  if (companyName !== undefined) profileData.companyName = companyName;
  if (npwp !== undefined) profileData.npwp = npwp ? sealNpwp(npwp) : null;
  if (businessType !== undefined) profileData.businessType = businessType;
  if (rajaongkirOriginId !== undefined) profileData.rajaongkirOriginId = rajaongkirOriginId;
  if (rajaongkirOriginLabel !== undefined) {
    profileData.rajaongkirOriginLabel = rajaongkirOriginLabel;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...userUpdate,
      ...(Object.keys(profileData).length > 0 && {
        profile: {
          upsert: {
            create: {
              bio: '',
              companyName: '',
              npwp: '',
              businessType: '',
              ...profileData,
            },
            update: profileData,
          },
        },
      }),
    },
  });

  const user = await getMe(userId);
  if (!user) throw new AppError('User tidak ditemukan.', 404);
  return user;
};

// ─── Resend OTP ──────────────────────────────────────────
export const resendOTP = async (email: string, type: ResendOtpType) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const otp = await tokenService.generateOtp(user.id, type);
  if (type === TokenType.EMAIL_VERIFICATION) {
    await emailService.sendOtpEmail(user.email, user.fullName, otp);
  } else {
    await emailService.sendPasswordResetEmail(user.email, user.fullName, otp);
  }
};

// ─── Email Availability Check ────────────────────────────
export const isEmailAvailable = async (email: string): Promise<boolean> => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  return !existingUser;
};
