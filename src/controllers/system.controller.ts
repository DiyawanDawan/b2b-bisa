import { Response, Request } from 'express';
import * as Enums from '#prisma';
import { PostStatus } from '#prisma';
import prisma from '#config/prisma';
import * as storageService from '#services/storage.service';
import { successResponse } from '#utils/response.util';
import catchAsync from '#utils/catchAsync';
import AppError from '#utils/appError';
import * as platformSettingsService from '#services/platformSettings.service';

/**
 * Get all system constants (Enums) for frontend dropdowns
 * GET /api/v1/system/constants
 */
/**
 * GET /api/v1/system/support
 * Kontak CS & URL verifikasi publik (mobile pusat bantuan, QR tagihan).
 */
export const getPublicSupport = catchAsync(async (_req: Request, res: Response) => {
  const items = await platformSettingsService.listPlatformSettingsForAdmin();
  const map = Object.fromEntries(items.map((i) => [i.key, i.value.trim()]));

  const publicVerifyBaseUrl = (map.PUBLIC_VERIFY_BASE_URL || 'http://localhost:3001').replace(
    /\/$/,
    '',
  );

  return successResponse(
    res,
    {
      supportWhatsapp: map.SUPPORT_WHATSAPP || '6281234567890',
      supportEmail: map.SUPPORT_EMAIL || 'cs@bisa.id',
      publicVerifyBaseUrl,
    },
    'Pengaturan dukungan publik',
  );
});

export const getConstants = catchAsync(async (_req: Request, res: Response) => {
  const constants = {
    UserRole: Enums.UserRole,
    VerificationStatus: Enums.VerificationStatus,
    BiomassaType: Enums.BiomassaType,
    BiocharGrade: Enums.BiocharGrade,
    OrderStatus: Enums.OrderStatus,
    TransactionStatus: Enums.TransactionStatus,
    PaymentStatus: Enums.PaymentStatus,
    PaymentMethod: Enums.PaymentMethod,
    PayoutStatus: Enums.PayoutStatus,
    NotificationType: Enums.NotificationType,
    NotificationPriority: Enums.NotificationPriority,
    DevicePlatform: Enums.DevicePlatform,
    DeviceStatus: Enums.DeviceStatus,
    PostStatus: Enums.PostStatus,
    UserTier: Enums.UserTier,
    ShipmentType: Enums.ShipmentType,
    VesselType: Enums.VesselType,
    PackagingType: Enums.PackagingType,
    ProductStatus: Enums.ProductStatus,
    UnitStatus: Enums.UnitStatus,
  };

  return successResponse(res, constants, 'Konstanta sistem berhasil diambil');
});

/**
 * GET /api/v1/system/announcements
 */
export const getAnnouncements = catchAsync(async (_req: Request, res: Response) => {
  const articles = await prisma.article.findMany({
    where: { status: PostStatus.PUBLISHED },
    take: 5,
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      publishedAt: true,
      imageUrl: true,
    },
  });

  return successResponse(res, articles, 'Pengumuman berhasil diambil');
});

/**
 * GET /robots.txt
 */
export const getRobots = (_req: Request, res: Response) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: https://api.bisa.id/api/v1/system/sitemap.xml');
};

/**
 * GET /sitemap.xml
 */
export const getSitemap = (_req: Request, res: Response) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://bisa.id/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://bisa.id/marketplace</loc>
    <priority>0.8</priority>
  </url>
</urlset>`);
};

/**
 * POST /api/v1/system/upload
 * Generic authenticated file upload (Negotiation attachment, Forum, Chat, dll.)
 *
 * SEC-BE-002: hanya untuk authenticated user (lihat routes/system.ts).
 * SEC-BE-005: folder dibatasi allowlist; karakter traversal di-reject.
 */
const ALLOWED_UPLOAD_FOLDERS = [
  'general',
  'products',
  'avatars',
  'negotiations',
  'forum',
  'chat',
] as const;
type AllowedFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number];

const isAllowedFolder = (value: string): value is AllowedFolder =>
  (ALLOWED_UPLOAD_FOLDERS as readonly string[]).includes(value);

export const uploadFile = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('File tidak ditemukan.', 400);
  }

  const folderInput = (req.query.folder as string | undefined)?.trim() || 'general';

  // Reject path traversal / separator / null byte
  if (
    folderInput.includes('..') ||
    folderInput.includes('/') ||
    folderInput.includes('\\') ||
    folderInput.includes('\0')
  ) {
    throw new AppError('Folder mengandung karakter terlarang.', 400);
  }

  if (!isAllowedFolder(folderInput)) {
    throw new AppError(
      `Folder tidak diizinkan. Pilih salah satu: ${ALLOWED_UPLOAD_FOLDERS.join(', ')}.`,
      400,
    );
  }

  // Sanitasi nama file: hanya alfanumerik, dash, underscore, titik
  const safeOriginal = req.file.originalname
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');
  const fileName = `${Date.now()}-${safeOriginal}`;
  const filePath = `${folderInput}/${fileName}`;

  const savedPath = await storageService.uploadFile(req.file.buffer, filePath, req.file.mimetype);

  const url = storageService.getPublicUrl(savedPath);

  return successResponse(res, { url, path: savedPath }, 'File berhasil diunggah');
});
