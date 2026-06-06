import { Response } from 'express';
import * as userService from '#services/user.service';
import * as authService from '#services/auth.service';
import * as storageService from '#services/storage.service';
import * as verificationService from '#services/verification.service';
import { successResponse, createdResponse, paginatedResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import { AuthRequest } from '#types/index';
import prisma from '#config/prisma';
import * as productService from '#services/product.service';
import { ProductStatus } from '#prisma';
import AppError from '#utils/appError';
import { attachUserMediaUrls } from '#utils/userMedia.util';
import { getUserReadiness } from '#utils/readiness.util';

/**
 * GET /api/v1/users/:id
 * Get public profile
 */
export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const isAuthorized = !!req.user;
  const data = await userService.getUserById(req.params.id, isAuthorized);
  return successResponse(res, attachUserMediaUrls(data), 'Profil user berhasil diambil');
});

/**
 * GET /api/v1/users/me
 * Self profile
 */
export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await authService.getMe(req.user!.id);
  if (!data) throw new AppError('User tidak ditemukan.', 404);
  successResponse(res, attachUserMediaUrls(data), 'Data profil');
});

/**
 * GET /api/v1/users/me/readiness
 */
export const getMyReadiness = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await getUserReadiness(req.user!.id);
  return successResponse(res, data, 'Status kelengkapan profil');
});

/**
 * PATCH /api/v1/users/me
 * Update self profile / avatar
 */
export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const updateData = { ...req.body };
  const userId = req.user!.id;

  if (req.file) {
    const oldUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    const extension = req.file.mimetype.split('/')[1];
    const newPath = `avatars/${userId}_${Date.now()}.${extension}`;

    const uploadedPath = await storageService.updateFile(
      req.file.buffer,
      newPath,
      oldUser?.avatarUrl || null,
      req.file.mimetype,
    );
    updateData.avatarUrl = uploadedPath;
  }

  const data = await authService.updateProfile(userId, updateData);
  successResponse(res, attachUserMediaUrls(data), 'Profil berhasil diperbarui');
});

/**
 * POST /api/v1/users/me/phone/request-update
 */
export const requestPhoneUpdate = catchAsync(async (req: AuthRequest, res: Response) => {
  const { phone } = req.body as { phone: string };

  const existing = await prisma.user.findFirst({
    where: { phone, id: { not: req.user!.id } },
  });
  if (existing) throw new AppError('Nomor telepon sudah digunakan oleh akun lain', 400);

  await verificationService.sendVerificationCode(req.user!.id, 'PHONE_UPDATE', phone);
  successResponse(res, null, 'Kode OTP telah dikirim ke nomor baru Anda');
});

/**
 * POST /api/v1/users/me/phone/verify-update
 */
export const verifyPhoneUpdate = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code, phone } = req.body as { code: string; phone: string };

  await verificationService.verifyCode(req.user!.id, 'PHONE_UPDATE', code, phone);
  const data = await prisma.user.update({
    where: { id: req.user!.id },
    data: { phone },
  });

  successResponse(res, data, 'Nomor telepon berhasil diperbarui');
});

// ─── Addresses ─────────────────────────────────────────

/**
 * GET /api/v1/users/me/addresses
 */
export const listAddresses = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));
  const { addresses, total } = await userService.listAddresses(req.user!.id, page, limit);
  return paginatedResponse(res, addresses, total, page, limit, 'Daftar alamat berhasil diambil');
});

/**
 * POST /api/v1/users/me/addresses
 */
export const createAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await userService.createAddress(req.user!.id, req.body);
  return createdResponse(res, data, 'Alamat berhasil ditambahkan');
});

/**
 * PUT /api/v1/users/me/addresses/:id
 */
export const updateAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await userService.updateAddress(req.params.id, req.user!.id, req.body);
  return successResponse(res, data, 'Alamat berhasil diperbarui');
});

/**
 * DELETE /api/v1/users/me/addresses/:id
 */
export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  await userService.deleteAddress(req.params.id, req.user!.id);
  return successResponse(res, null, 'Alamat berhasil dihapus');
});

/**
 * PATCH /api/v1/users/me/addresses/:id/set-default
 */
export const setDefaultAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await userService.setDefaultAddress(req.params.id, req.user!.id);
  return successResponse(res, data, 'Alamat utama berhasil diperbarui');
});

// ─── Operating Hours ────────────────────────────────────

/**
 * GET /api/v1/users/me/operating-hours
 */
export const listOperatingHours = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await userService.listOperatingHours(req.user!.id);
  return successResponse(res, data, 'Jam operasional berhasil diambil');
});

/**
 * PUT /api/v1/users/me/operating-hours
 */
export const updateOperatingHours = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await userService.updateOperatingHours(req.user!.id, req.body);
  return successResponse(res, data, 'Jam operasional berhasil diperbarui');
});

// ─── Supplier Directory (Public) ─────────────────────────

/**
 * GET /api/v1/suppliers
 */
export const listSuppliers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));
  const isAuthorized = !!req.user;

  const filters = {
    ...req.query,
    page,
    limit,
  };

  const { suppliers, total } = await userService.listSuppliers(
    filters as Parameters<typeof userService.listSuppliers>[0],
    isAuthorized,
  );
  return paginatedResponse(
    res,
    suppliers.map((s) => attachUserMediaUrls(s)),
    total,
    page,
    limit,
    'Daftar supplier berhasil diambil',
  );
});

/**
 * GET /api/v1/suppliers/:id
 */
export const getSupplierDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const isAuthorized = !!req.user;
  const data = await userService.getSupplierDetail(req.params.id, isAuthorized);
  return successResponse(res, attachUserMediaUrls(data), 'Detail supplier berhasil diambil');
});
/**
 * GET /api/v1/suppliers/:id/products
 */
export const getSupplierProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const search = req.query.search as string | undefined;

  const result = await productService.listProducts({
    userId: id,
    status: ProductStatus.ACTIVE,
    search,
    page,
    limit,
  });

  return paginatedResponse(
    res,
    result.products,
    result.total,
    page,
    limit,
    'Katalog produk supplier berhasil diambil',
  );
});

/**
 * GET /api/v1/suppliers/:id/verification-status
 */
export const getSupplierVerification = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const data = await prisma.user.findUnique({
    where: { id },
    select: {
      fullName: true,
      verification: {
        select: {
          verificationStatus: true,
          isVerified: true,
          reviewedAt: true,
        },
      },
    },
  });

  if (!data) throw new AppError('Penyuplai tidak ditemukan', 404);

  return successResponse(
    res,
    {
      supplierId: id,
      fullName: data.fullName,
      isVerified: data.verification?.isVerified || false,
      status: data.verification?.verificationStatus || 'UNVERIFIED',
      verifiedAt: data.verification?.reviewedAt || null,
      badge: data.verification?.isVerified ? '✅ Terverifikasi oleh BISA Platform' : null,
    },
    'Status verifikasi suplayer berhasil diambil',
  );
});
