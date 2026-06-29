import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../../src/config/logger.js';
import slugify from '../../../src/utils/slugify.ts';
import * as storageService from '#services/storage.service';
import { biomassImagePaths, organicProduceImagePaths } from '../../../src/utils/loremFlickrMedia.util.ts';
import {
  downloadStockImage,
  downloadStockVideo,
  hasStockPhotoApiKey,
  resolveStockQuery,
  resolveStockVideoQuery,
} from './stockPhotoApi.util.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const r2PathCache = new Map<string, string>();

/** Lock loremflickr (ratusan/ribuan) ≠ halaman API stock photo (max ~15–20). */
const toStockApiPage = (lockOrPage: number): number => (Math.abs(lockOrPage) % 15) + 1;

const isStaleSeedMediaPath = (url: string | null | undefined): boolean =>
  !url ||
  url.startsWith('external/loremflickr') ||
  url.includes('/390928-');

const cacheResolvedPath = (cacheKey: string, path: string) => {
  if (path.startsWith('products/')) r2PathCache.set(cacheKey, path);
};

export type SeedMediaContext = {
  productName?: string;
  mediaSlug?: string;
  includeVideo?: boolean;
  /** Grade biochar (A/B/C) — variasi query Pexels. */
  grade?: string | null;
};

export type SeedProductMedia = {
  thumbnailUrl: string;
  images: Array<{ url: string; isPrimary: boolean; order: number }>;
  videoUrl: string | null;
};

/** Slug dari judul produk (tanpa provinsi) — dipakai sebagai nama file R2. */
export const buildProductMediaSlug = (
  productName?: string,
  biomassaType?: string,
  grade?: string | null,
): string => {
  if (productName?.trim()) {
    const title =
      productName.split('—')[0]?.split(' - ')[0]?.trim() ?? productName.trim();
    const slug = slugify(title);
    if (slug) return slug.slice(0, 96);
  }
  const fallback = [biomassaType, grade].filter(Boolean).join(' ').replace(/_/g, ' ');
  return slugify(fallback) || 'produk-biomassa';
};

const resolveLocalAsset = (mediaSlug: string, fileLabel: string): string | null => {
  const candidates = [
    path.join(__dirname, '../assets/products', `${mediaSlug}-${fileLabel}.jpg`),
    path.join(__dirname, '../assets/products', `${mediaSlug}-${fileLabel}.png`),
    path.join(__dirname, '../assets/products', `${mediaSlug}-${fileLabel}.mp4`),
    path.join(__dirname, '../assets/products', `${mediaSlug}-${fileLabel}.webm`),
    path.join(__dirname, '../assets/banners', 'banner1.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const readLocalFile = (
  mediaSlug: string,
  fileLabel: string,
): { buffer: Buffer; contentType: string; ext: string } | null => {
  const localPath = resolveLocalAsset(mediaSlug, fileLabel);
  if (!localPath) return null;

  const ext = path.extname(localPath).slice(1).toLowerCase() || 'jpg';
  const contentType =
    ext === 'png'
      ? 'image/png'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'mp4'
          ? 'video/mp4'
          : ext === 'webm'
            ? 'video/webm'
            : 'image/jpeg';

  return { buffer: fs.readFileSync(localPath), contentType, ext };
};

const slotToFileLabel = (slot: string): string => {
  if (slot === 'thumb' || slot === 'thumbnail') return 'thumbnail';
  if (slot === 'img-0' || slot === 'gallery-1') return 'gallery-1';
  if (slot === 'img-1' || slot === 'gallery-2') return 'gallery-2';
  if (slot === 'promo-video' || slot === 'video') return 'promo-video';
  return slot;
};

async function readImagePayload(
  kind: 'biomass' | 'organic',
  topicKey: string,
  mediaSlug: string,
  slot: string,
  page: number,
  grade?: string | null,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  const fileLabel = slotToFileLabel(slot);
  const local = readLocalFile(mediaSlug, fileLabel);
  if (local) return local;

  if (hasStockPhotoApiKey()) {
    const query = resolveStockQuery(kind, topicKey, grade);
    return downloadStockImage(query, toStockApiPage(page), slot);
  }

  return null;
}

async function readVideoPayload(
  kind: 'biomass' | 'organic',
  topicKey: string,
  mediaSlug: string,
  page: number,
  grade?: string | null,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  const local = readLocalFile(mediaSlug, 'promo-video');
  if (local) return local;

  if (hasStockPhotoApiKey()) {
    const query = resolveStockVideoQuery(kind, topicKey, grade);
    return downloadStockVideo(query, toStockApiPage(page));
  }

  return null;
}

function buildR2ObjectKey(mediaSlug: string, fileLabel: string, ext: string): string {
  return `products/seed-stock/${mediaSlug}/${mediaSlug}-${fileLabel}.${ext}`;
}

async function uploadSeedFileToR2(
  mediaSlug: string,
  fileLabel: string,
  payload: { buffer: Buffer; contentType: string; ext: string },
): Promise<string> {
  const key = buildR2ObjectKey(mediaSlug, fileLabel, payload.ext);
  const stored = await storageService.uploadFile(payload.buffer, key, payload.contentType);
  return storageService.normalizeStorageKey(stored) ?? stored;
}

async function uploadSeedImageSlot(
  kind: 'biomass' | 'organic',
  topicKey: string,
  mediaSlug: string,
  slot: string,
  page: number,
  fallbackDbPath: string,
  grade?: string | null,
): Promise<string> {
  const fileLabel = slotToFileLabel(slot);
  const cacheKey = `${mediaSlug}:${fileLabel}`;
  const cached = r2PathCache.get(cacheKey);
  if (cached) return cached;

  const payload = await readImagePayload(kind, topicKey, mediaSlug, slot, page, grade);
  if (!payload) {
    if (!hasStockPhotoApiKey()) cacheResolvedPath(cacheKey, fallbackDbPath);
    return fallbackDbPath;
  }

  try {
    const normalized = await uploadSeedFileToR2(mediaSlug, fileLabel, payload);
    cacheResolvedPath(cacheKey, normalized);
    return normalized;
  } catch (err) {
    logger.warn(
      `[seed] Upload R2 gagal (${mediaSlug}-${fileLabel}): ${(err as Error).message}`,
    );
    if (!hasStockPhotoApiKey()) cacheResolvedPath(cacheKey, fallbackDbPath);
    return fallbackDbPath;
  }
}

async function uploadSeedVideo(
  kind: 'biomass' | 'organic',
  topicKey: string,
  mediaSlug: string,
  page: number,
  grade?: string | null,
): Promise<string | null> {
  const cacheKey = `${mediaSlug}:promo-video`;
  const cached = r2PathCache.get(cacheKey);
  if (cached) return cached;

  const payload = await readVideoPayload(kind, topicKey, mediaSlug, page, grade);
  if (!payload) return null;

  try {
    const normalized = await uploadSeedFileToR2(mediaSlug, 'promo-video', payload);
    cacheResolvedPath(cacheKey, normalized);
    return normalized;
  } catch (err) {
    logger.warn(`[seed] Upload video R2 gagal (${mediaSlug}): ${(err as Error).message}`);
    return null;
  }
}

const buildMediaFromPaths = async (
  kind: 'biomass' | 'organic',
  topicKey: string,
  page: number,
  ctx: SeedMediaContext,
  paths: {
    thumbnailUrl: string;
    images: Array<{ url: string; isPrimary: boolean; order: number }>;
  },
): Promise<SeedProductMedia> => {
  const mediaSlug = ctx.mediaSlug ?? buildProductMediaSlug(ctx.productName, topicKey, ctx.grade);

  const [thumbnailUrl, gallery1Url, gallery2Url, videoUrl] = await Promise.all([
    uploadSeedImageSlot(
      kind,
      topicKey,
      mediaSlug,
      'thumbnail',
      page,
      paths.thumbnailUrl,
      ctx.grade,
    ),
    uploadSeedImageSlot(
      kind,
      topicKey,
      mediaSlug,
      'gallery-1',
      page,
      paths.images[0]?.url ?? paths.thumbnailUrl,
      ctx.grade,
    ),
    uploadSeedImageSlot(
      kind,
      topicKey,
      mediaSlug,
      'gallery-2',
      page,
      paths.images[1]?.url ?? paths.thumbnailUrl,
      ctx.grade,
    ),
    ctx.includeVideo === false
      ? Promise.resolve(null)
      : uploadSeedVideo(kind, topicKey, mediaSlug, page, ctx.grade),
  ]);

  const images = paths.images.map((img, index) => ({
    ...img,
    url: index === 0 ? gallery1Url : gallery2Url,
  }));

  return { thumbnailUrl, images, videoUrl };
};

export const resolveBiomassProductMediaForSeed = async (
  faker: { helpers: { arrayElement: <T>(list: T[]) => T } },
  biomassaType: string,
  page: number,
  ctx: SeedMediaContext = {},
): Promise<SeedProductMedia> => {
  const paths = biomassImagePaths(faker, biomassaType, page);
  return buildMediaFromPaths('biomass', biomassaType, page, ctx, paths);
};

export const resolveOrganicProductMediaForSeed = async (
  faker: { helpers: { arrayElement: <T>(list: T[]) => T } },
  cropType: string,
  page: number,
  ctx: SeedMediaContext = {},
): Promise<SeedProductMedia> => {
  const paths = organicProduceImagePaths(faker, cropType, page);
  return buildMediaFromPaths('organic', cropType, page, { ...ctx, includeVideo: true }, paths);
};

export const getRegionalSeedMediaUploadCount = (): number => r2PathCache.size;

export const countRegionalSeedR2Paths = (): number =>
  [...r2PathCache.values()].filter((v) => v.startsWith('products/')).length;

/** Lock stabil per komoditas — hemat download (satu set R2 per jenis, bukan per SKU random). */
export const COMMODITY_MEDIA_LOCK: Record<string, number> = {
  'organic:Beras Organik': 3101,
  'organic:Jagung Premium': 3102,
  'organic:Kentang Organik': 3103,
  'organic:Sayur Hijau': 3104,
  'organic:Biji-bijian': 3105,
  'organic:Buah-buahan': 3106,
  'biomass:BIOCHAR:A': 3201,
  'biomass:BIOCHAR:B': 3202,
  'biomass:BIOCHAR:C': 3203,
  'biomass:BIOCHAR': 3200,
  'biomass:SEKAM_PADI': 3211,
  'biomass:TONGKOL_JAGUNG': 3212,
  'biomass:TEMPURUNG_KELAPA': 3213,
  'biomass:WOOD_CHIP': 3214,
};

export const commodityMediaCacheKey = (
  kind: 'organic' | 'biomass',
  topicKey: string,
  grade?: string | null,
): string =>
  kind === 'biomass' && topicKey === 'BIOCHAR' && grade
    ? `biomass:BIOCHAR:${grade}`
    : `${kind}:${topicKey}`;

export const commodityMediaLock = (
  kind: 'organic' | 'biomass',
  topicKey: string,
  grade?: string | null,
): number => COMMODITY_MEDIA_LOCK[commodityMediaCacheKey(kind, topicKey, grade)] ?? 3300;

export type SeedMediaCache = Map<string, SeedProductMedia>;

export const getOrResolveOrganicMedia = async (
  cache: SeedMediaCache,
  faker: { helpers: { arrayElement: <T>(list: T[]) => T } },
  cropType: string,
  templateName: string,
  includeVideo = true,
): Promise<SeedProductMedia> => {
  const cacheKey = commodityMediaCacheKey('organic', cropType);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const page = commodityMediaLock('organic', cropType);
  const mediaSlug = buildProductMediaSlug(templateName, cropType);
  const media = await resolveOrganicProductMediaForSeed(faker, cropType, page, {
    productName: templateName,
    mediaSlug,
    includeVideo,
  });
  cache.set(cacheKey, media);
  return media;
};

export const getOrResolveBiomassMedia = async (
  cache: SeedMediaCache,
  faker: { helpers: { arrayElement: <T>(list: T[]) => T } },
  biomassaType: string,
  templateName: string,
  grade?: string | null,
  includeVideo = true,
): Promise<SeedProductMedia> => {
  const cacheKey = commodityMediaCacheKey('biomass', biomassaType, grade);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const page = commodityMediaLock('biomass', biomassaType, grade);
  const mediaSlug = buildProductMediaSlug(templateName, biomassaType, grade);
  const media = await resolveBiomassProductMediaForSeed(faker, biomassaType, page, {
    productName: templateName,
    mediaSlug,
    grade,
    includeVideo,
  });
  cache.set(cacheKey, media);
  return media;
};

type SeedProductRow = {
  id: string;
  name: string;
  biomassaType: string;
  grade: string | null;
  productMode: string;
  cropType: string | null;
  thumbnailUrl: string | null;
  video: { id: string } | null;
  images: Array<{ id: string; url: string; order: number }>;
};

const mediaLockFromSlug = (mediaSlug: string): number => {
  let hash = 1;
  for (let i = 0; i < mediaSlug.length; i += 1) {
    hash = (hash * 31 + mediaSlug.charCodeAt(i)) % 900_000;
  }
  return hash + 1;
};

const resolveMediaForProduct = async (
  faker: { helpers: { arrayElement: <T>(list: T[]) => T } },
  product: Pick<SeedProductRow, 'name' | 'biomassaType' | 'grade' | 'productMode' | 'cropType'>,
  mediaSlug: string,
) => {
  const page = mediaLockFromSlug(mediaSlug);
  const ctx = {
    productName: product.name,
    mediaSlug,
    includeVideo: true as const,
    grade: product.grade,
  };

  if (product.productMode === 'ORGANIC_PRODUCE') {
    return resolveOrganicProductMediaForSeed(faker, product.cropType ?? 'Sayur Hijau', page, ctx);
  }

  return resolveBiomassProductMediaForSeed(faker, product.biomassaType, page, ctx);
};

/** Perbarui produk yang masih pakai path loremflickr / tanpa video setelah API+R2 tersedia. */
export const backfillStaleProductMedia = async (
  prisma: {
    product: {
      findMany: (args: unknown) => Promise<SeedProductRow[]>;
      update: (args: unknown) => Promise<unknown>;
    };
  },
  faker: { helpers: { arrayElement: <T>(list: T[]) => T } },
): Promise<number> => {
  if (!hasStockPhotoApiKey()) {
    logger.warn('[seed] Skip backfill media — PEXELS_API_KEY / PIXABAY_API_KEY kosong.');
    return 0;
  }

  const staleImageProducts = await prisma.product.findMany({
    where: {
      OR: [
        { thumbnailUrl: { startsWith: 'external/loremflickr' } },
        { thumbnailUrl: { contains: '/390928-' } },
        { thumbnailUrl: null },
        { images: { none: {} } },
        { images: { some: { url: { startsWith: 'external/loremflickr' } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      biomassaType: true,
      grade: true,
      productMode: true,
      cropType: true,
      thumbnailUrl: true,
      video: { select: { id: true } },
      images: { select: { id: true, url: true, order: true } },
    },
  });

  const missingVideoProducts = await prisma.product.findMany({
    where: {
      video: { is: null },
      thumbnailUrl: { startsWith: 'products/' },
    },
    select: {
      id: true,
      name: true,
      biomassaType: true,
      grade: true,
      productMode: true,
      cropType: true,
      thumbnailUrl: true,
      video: { select: { id: true } },
      images: { select: { id: true, url: true, order: true } },
    },
  });

  const productById = new Map<string, SeedProductRow>();
  for (const row of [...staleImageProducts, ...missingVideoProducts]) {
    productById.set(row.id, row);
  }
  const products = [...productById.values()];

  if (products.length === 0) return 0;

  logger.info(`[seed] Backfill media: ${products.length} produk perlu diperbarui...`);

  const mediaBySlug = new Map<string, SeedProductMedia>();
  let updated = 0;

  for (const product of products) {
    const mediaSlug = buildProductMediaSlug(product.name, product.biomassaType, product.grade);
    const needsThumb = isStaleSeedMediaPath(product.thumbnailUrl);
    const needsImages =
      product.images.length === 0 ||
      product.images.some((img) => isStaleSeedMediaPath(img.url));
    const needsVideo = !product.video;

    if (!needsThumb && !needsImages && !needsVideo) continue;

    if (!mediaBySlug.has(mediaSlug)) {
      mediaBySlug.set(mediaSlug, await resolveMediaForProduct(faker, product, mediaSlug));
    }
    const media = mediaBySlug.get(mediaSlug)!;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(needsThumb && { thumbnailUrl: media.thumbnailUrl }),
        ...(needsImages && {
          images: {
            deleteMany: {},
            create: media.images,
          },
        }),
        ...(needsVideo &&
          media.videoUrl && {
            video: { create: { url: media.videoUrl } },
          }),
      },
    });
    updated++;
    if (updated % 100 === 0) {
      logger.info(`[seed] Backfill media: ${updated}/${products.length}...`);
    }
  }

  return updated;
};
