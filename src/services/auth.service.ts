import bcrypt from 'bcrypt';
import { addMinutes } from 'date-fns';
import crypto from 'crypto';
import { TokenType, UserStatus, UserRole, Prisma } from '#prisma';
import prisma from '#config/prisma';
import AppError from '#utils/appError';
import * as tokenService from '#services/token.service';

import * as emailService from '#services/email.service';

type ResendOtpType = typeof TokenType.EMAIL_VERIFICATION | typeof TokenType.RESET_PASSWORD;

// ─── Register ────────────────────────────────────────────
export const register = async (userData: {
  fullName: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'SUPPLIER' | 'BUYER';
  province?: string;
  regency?: string;
}) => {
  const { fullName, email, password, phone, role, province, regency } = userData;

  // Check if user exists
  const orConditions: Prisma.UserWhereInput[] = [{ email }];
  if (phone) orConditions.push({ phone });

  const existingUser = await prisma.user.findFirst({
    where: { OR: orConditions },
  });
  if (existingUser) throw new AppError('Email atau nomor telepon sudah terdaftar', 400);

  // Hash password

  const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

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
      avatarUrl: user.avatarUrl,
      province: user.province,
    },
  };
};

// ─── Social Login ────────────────────────────────────────
export const loginWithSocial = async (
  provider: 'google' | 'facebook',
  idToken: string,
  role?: UserRole,
) => {
  void provider;
  void idToken;
  void role;
  throw new AppError(`Login dengan ${provider} belum diimplementasikan.`, 501);
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

export const verifyResetCode = async (email: string, code: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('User tidak ditemukan.', 404);
  const valid = await tokenService.verifyOtp(user.id, code, TokenType.RESET_PASSWORD);
  if (!valid) throw new AppError('Kode OTP tidak valid atau sudah expired.', 400);

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

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });

  // Hapus token setelah dipakai (one-time use)
  await prisma.token.delete({ where: { id: record.id } });
};

export const resetPassword = async (userId: string, password: string) => {
  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
};

// ─── Profile ─────────────────────────────────────────────
export const getMe = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      tier: true,
      phone: true,
      avatarUrl: true,
      province: true,
      regency: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      status: true,
      // Profile: hanya field yang relevan untuk UI
      profile: {
        select: {
          bio: true,
          website: true,
          companyName: true,
          npwp: true,
          businessType: true,
        },
      },
      // Verification: hanya status, bukan seluruh dokumen URL
      verification: { select: { verificationStatus: true, isVerified: true } },
      createdAt: true,
    },
  });
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
}

export const updateProfile = async (userId: string, data: UpdateProfileInput) => {
  const { fullName, phone, avatarUrl, province, regency, bio, companyName, npwp, businessType } =
    data;

  const userUpdate: Record<string, unknown> = {};
  if (fullName) userUpdate.fullName = fullName;
  if (phone) userUpdate.phone = phone;
  if (avatarUrl) userUpdate.avatarUrl = avatarUrl;
  if (province) userUpdate.province = province;
  if (regency) userUpdate.regency = regency;

  // Profile fields: Only include if explicitly defined to avoid overwriting existing data with null
  const profileData: Record<string, unknown> = {};
  if (bio !== undefined) profileData.bio = bio;
  if (companyName !== undefined) profileData.companyName = companyName;
  if (npwp !== undefined) profileData.npwp = npwp;
  if (businessType !== undefined) profileData.businessType = businessType;

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...userUpdate,
      ...(Object.keys(profileData).length > 0 && {
        profile: {
          upsert: {
            create: {
              bio: (profileData.bio as string) || '',
              companyName: (profileData.companyName as string) || '',
              npwp: (profileData.npwp as string) || '',
              businessType: (profileData.businessType as string) || '',
            },
            update: profileData,
          },
        },
      }),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      phone: true,
      avatarUrl: true,
      province: true,
      regency: true,
      profile: {
        select: {
          bio: true,
          website: true,
          companyName: true,
          npwp: true,
          businessType: true,
        },
      },
    },
  });
};

// ─── Resend OTP ──────────────────────────────────────────
export const resendOTP = async (
  email: string,
  type: ResendOtpType,
) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const otp = await tokenService.generateOtp(user.id, type);
  if (type === TokenType.EMAIL_VERIFICATION) {
    await emailService.sendOtpEmail(user.email, user.fullName, otp);
  } else {
    await emailService.sendPasswordResetEmail(user.email, user.fullName, otp);
  }
};
