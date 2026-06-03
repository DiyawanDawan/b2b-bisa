import prisma from '#config/prisma';
import AppError from '#utils/appError';
import slugify from '#utils/slugify';
import * as storageService from '#services/storage.service';

export const MAX_STORE_BANNERS = 10;

const MIME_EXT_ALIASES: Record<string, string> = {
  jpeg: 'jpg',
  'svg+xml': 'svg',
};

const resolveImageExtension = (mimetype: string): string => {
  const raw = mimetype.split('/')[1]?.split(';')[0]?.trim().toLowerCase() || 'jpg';
  return MIME_EXT_ALIASES[raw] ?? raw;
};

/** Nama file R2 yang jelas: store-banners/{slug-toko}/banner-01.webp */
export const buildStoreBannerObjectKey = async (
  userId: string,
  mimetype: string,
  sequence: number,
): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      profile: { select: { companyName: true } },
    },
  });

  const storeLabel =
    user?.profile?.companyName?.trim() || user?.fullName?.trim() || `toko-${userId.slice(0, 8)}`;

  const storeSlug = slugify(storeLabel) || `toko-${userId.slice(0, 8)}`;
  const ext = resolveImageExtension(mimetype);
  const seq = String(Math.max(1, sequence)).padStart(2, '0');
  const ownerTag = userId.slice(0, 8);

  return `store-banners/${storeSlug}-${ownerTag}/banner-${seq}.${ext}`;
};

const formatBanner = (banner: {
  id: string;
  userId: string;
  imageUrl: string;
  title: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: banner.id,
  userId: banner.userId,
  imageUrl: storageService.getPublicUrl(banner.imageUrl) ?? banner.imageUrl,
  title: banner.title,
  sortOrder: banner.sortOrder,
  isActive: banner.isActive,
  createdAt: banner.createdAt,
  updatedAt: banner.updatedAt,
});

/** Pastikan DB hanya menyimpan R2 key relatif (bukan URL publik penuh). */
export const normalizeBannerImageRef = (imageUrl: string): string => {
  const key = storageService.normalizeStorageKey(imageUrl);
  return key ?? imageUrl;
};

/** Perbaiki baris lama yang menyimpan URL cloudflarestorage / proxy penuh. */
export const repairStoreBannerImageRefs = async () => {
  const banners = await prisma.storeBanner.findMany({
    select: { id: true, imageUrl: true },
  });

  let repaired = 0;
  for (const banner of banners) {
    const normalized = storageService.normalizeStorageKey(banner.imageUrl);
    if (!normalized || normalized === banner.imageUrl) continue;
    if (storageService.isExternalMediaUrl(normalized)) continue;

    await prisma.storeBanner.update({
      where: { id: banner.id },
      data: { imageUrl: normalized },
    });
    repaired++;
  }

  return repaired;
};

export const listStoreBanners = async (
  userId: string,
  options: { activeOnly?: boolean; ownerId?: string } = {},
) => {
  const { activeOnly = false, ownerId } = options;
  const isOwner = ownerId === userId;

  const banners = await prisma.storeBanner.findMany({
    where: {
      userId,
      ...(activeOnly && !isOwner ? { isActive: true } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return banners.map(formatBanner);
};

export const createStoreBanner = async (
  userId: string,
  file: { buffer: Buffer; mimetype: string },
  data: { title?: string } = {},
) => {
  const count = await prisma.storeBanner.count({ where: { userId } });
  if (count >= MAX_STORE_BANNERS) {
    throw new AppError(`Maksimal ${MAX_STORE_BANNERS} banner toko.`, 400);
  }

  const path = await buildStoreBannerObjectKey(userId, file.mimetype, count + 1);
  const storedKey = await storageService.uploadFile(file.buffer, path, file.mimetype);

  const maxSort = await prisma.storeBanner.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });

  const banner = await prisma.storeBanner.create({
    data: {
      userId,
      imageUrl: normalizeBannerImageRef(storedKey),
      title: data.title?.trim() || null,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  return formatBanner(banner);
};

export const updateStoreBanner = async (
  userId: string,
  bannerId: string,
  data: { title?: string; sortOrder?: number; isActive?: boolean },
) => {
  const existing = await prisma.storeBanner.findFirst({
    where: { id: bannerId, userId },
  });
  if (!existing) throw new AppError('Banner toko tidak ditemukan.', 404);

  const banner = await prisma.storeBanner.update({
    where: { id: bannerId },
    data,
  });

  return formatBanner(banner);
};

export const deleteStoreBanner = async (userId: string, bannerId: string) => {
  const existing = await prisma.storeBanner.findFirst({
    where: { id: bannerId, userId },
  });
  if (!existing) throw new AppError('Banner toko tidak ditemukan.', 404);

  await storageService.deleteFile(existing.imageUrl);
  await prisma.storeBanner.delete({ where: { id: bannerId } });

  return { id: bannerId };
};
