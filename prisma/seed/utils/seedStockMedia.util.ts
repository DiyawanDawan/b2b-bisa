import logger from '../../../src/config/logger.js';
import * as storageService from '#services/storage.service';
import { loremFlickrDbPath } from '../../../src/utils/loremFlickrMedia.util.ts';
import {
  downloadStockImage,
  downloadStockVideo,
  hasStockPhotoApiKey,
} from './stockPhotoApi.util.ts';

const r2PathCache = new Map<string, string>();

/** Lock/seed index → halaman API stock (max ~15). */
const toStockApiPage = (lockOrPage: number) => (Math.abs(lockOrPage) % 15) + 1;

const slugify = (value: string) =>
  String(value || 'media')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'media';

/**
 * Query Pexels/Pixabay dari keyword/slug seed.
 */
export const keywordsToStockQuery = (keywords: string | string[]) => {
  const parts = (Array.isArray(keywords) ? keywords : [keywords])
    .map((k) =>
      String(k || '')
        .replace(/-/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  if (parts.length === 0) return 'agriculture indonesia';
  return parts.slice(0, 3).join(' ');
};

async function uploadToR2(
  folder: string,
  fileBase: string,
  payload: { buffer: Buffer; contentType: string; ext: string },
): Promise<string | null> {
  const key = `${folder}/seed-stock/${fileBase}.${payload.ext}`;
  if (r2PathCache.has(key)) return r2PathCache.get(key)!;

  try {
    const stored = await storageService.uploadFile(payload.buffer, key, payload.contentType);
    const normalized = storageService.normalizeStorageKey(stored) ?? stored;
    r2PathCache.set(key, normalized);
    return normalized;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[seed-stock] Upload R2 gagal (${key}): ${message}. Pakai fallback placeholder.`);
    return null;
  }
}

export type ResolveSeedImageOpts = {
  folder: string;
  slug: string;
  query: string;
  page?: number;
  slot?: string;
  fallbackKeywords?: string | string[];
  fallbackLock?: number;
};

/** Fetch gambar stock → R2. Fallback path loremflickr/Picsum jika API/R2 gagal. */
export async function resolveSeedStockImage(opts: ResolveSeedImageOpts): Promise<string> {
  const {
    folder,
    slug,
    query,
    page = 1,
    slot = 'thumb',
    fallbackKeywords = ['agriculture'],
    fallbackLock = 1,
  } = opts;

  const cacheKey = `img:${folder}:${slug}:${query}:${page}:${slot}`;
  if (r2PathCache.has(cacheKey)) return r2PathCache.get(cacheKey)!;

  if (hasStockPhotoApiKey()) {
    const payload = await downloadStockImage(query, toStockApiPage(page), slot);
    if (payload) {
      const fileBase = `${slugify(slug)}-${slot}-${toStockApiPage(page)}`;
      const key = await uploadToR2(folder, fileBase, payload);
      if (key) {
        r2PathCache.set(cacheKey, key);
        return key;
      }
    }
  }

  const fallback = loremFlickrDbPath(fallbackKeywords, { lock: fallbackLock });
  r2PathCache.set(cacheKey, fallback);
  return fallback;
}

export type ResolveSeedVideoOpts = {
  folder: string;
  slug: string;
  query: string;
  page?: number;
};

/** Fetch video stock → R2. Return null jika tidak tersedia. */
export async function resolveSeedStockVideo(opts: ResolveSeedVideoOpts): Promise<string | null> {
  const { folder, slug, query, page = 1 } = opts;
  if (!hasStockPhotoApiKey()) return null;

  const cacheKey = `vid:${folder}:${slug}:${query}:${page}`;
  if (r2PathCache.has(cacheKey)) return r2PathCache.get(cacheKey)!;

  const payload = await downloadStockVideo(query, toStockApiPage(page));
  if (!payload) return null;

  const fileBase = `${slugify(slug)}-video-${toStockApiPage(page)}`;
  const key = await uploadToR2(folder, fileBase, payload);
  if (key) r2PathCache.set(cacheKey, key);
  return key;
}

/** Media untuk 1 postingan forum: 1 gambar (+ video opsional). */
export async function buildForumPostMedia(opts: {
  groupSlug: string;
  keywords?: string[];
  lock: number;
  includeVideo?: boolean;
}): Promise<Array<{ url: string; type: 'image' | 'video' }>> {
  const { groupSlug, keywords, lock, includeVideo = false } = opts;
  const query = keywordsToStockQuery(keywords?.length ? keywords : [groupSlug, 'agriculture']);
  const media: Array<{ url: string; type: 'image' | 'video' }> = [];

  const imageUrl = await resolveSeedStockImage({
    folder: 'forum',
    slug: `${groupSlug}-post`,
    query,
    page: lock,
    slot: 'gallery-1',
    fallbackKeywords: keywords?.length ? keywords : ['forum', 'community', groupSlug],
    fallbackLock: lock,
  });
  media.push({ url: imageUrl, type: 'image' });

  if (includeVideo) {
    const videoUrl = await resolveSeedStockVideo({
      folder: 'forum',
      slug: `${groupSlug}-post`,
      query: `${query} farm`,
      page: lock + 3,
    });
    if (videoUrl) media.push({ url: videoUrl, type: 'video' });
  }

  return media;
}

/** Avatar + banner grup forum. */
export async function buildForumGroupCoverMedia(opts: {
  slug: string;
  keywords: string[];
  lock: number;
}): Promise<{ avatarUrl: string; bannerUrl: string }> {
  const { slug, keywords, lock } = opts;
  const query = keywordsToStockQuery(keywords);
  const avatarUrl = await resolveSeedStockImage({
    folder: 'forum-groups',
    slug: `${slug}-avatar`,
    query,
    page: lock,
    slot: 'thumb',
    fallbackKeywords: keywords,
    fallbackLock: lock,
  });
  const bannerUrl = await resolveSeedStockImage({
    folder: 'forum-groups',
    slug: `${slug}-banner`,
    query: `${query} landscape`,
    page: lock + 1,
    slot: 'gallery-1',
    fallbackKeywords: keywords,
    fallbackLock: lock + 1,
  });
  return { avatarUrl, bannerUrl };
}

/** Array path gambar review (JSON string untuk kolom imageUrl). */
export async function buildReviewImageUrls(lockBase: number): Promise<string> {
  const urls = await Promise.all([
    resolveSeedStockImage({
      folder: 'reviews',
      slug: `review-${lockBase}`,
      query: 'warehouse cargo delivery',
      page: lockBase,
      slot: 'gallery-1',
      fallbackKeywords: ['delivery', 'warehouse', 'cargo'],
      fallbackLock: lockBase,
    }),
    resolveSeedStockImage({
      folder: 'reviews',
      slug: `review-pkg-${lockBase}`,
      query: 'package box received',
      page: lockBase + 1,
      slot: 'gallery-2',
      fallbackKeywords: ['package', 'box', 'received'],
      fallbackLock: lockBase + 1,
    }),
  ]);
  return JSON.stringify(urls);
}

/** Foto POD / bukti serah terima. */
export async function buildPodPhotoUrls(lockBase: number): Promise<string[]> {
  return Promise.all([
    resolveSeedStockImage({
      folder: 'shipments',
      slug: `pod-${lockBase}`,
      query: 'truck delivery proof',
      page: lockBase,
      slot: 'gallery-1',
      fallbackKeywords: ['truck', 'delivery', 'proof'],
      fallbackLock: lockBase,
    }),
    resolveSeedStockImage({
      folder: 'shipments',
      slug: `pod-sign-${lockBase}`,
      query: 'receipt handover document',
      page: lockBase + 1,
      slot: 'gallery-2',
      fallbackKeywords: ['signature', 'handover', 'receipt'],
      fallbackLock: lockBase + 1,
    }),
  ]);
}

export async function buildPaymentProofUrl(lock: number): Promise<string> {
  return resolveSeedStockImage({
    folder: 'payments',
    slug: `proof-${lock}`,
    query: 'bank transfer receipt',
    page: lock,
    slot: 'thumb',
    fallbackKeywords: ['receipt', 'transfer', 'bank'],
    fallbackLock: lock,
  });
}

export async function buildDisputeEvidenceUrls(lockBase: number): Promise<string[]> {
  return Promise.all([
    resolveSeedStockImage({
      folder: 'disputes',
      slug: `buyer-${lockBase}`,
      query: 'damaged package complaint',
      page: lockBase,
      slot: 'gallery-1',
      fallbackKeywords: ['damage', 'package', 'complaint'],
      fallbackLock: lockBase,
    }),
    resolveSeedStockImage({
      folder: 'disputes',
      slug: `buyer-q-${lockBase}`,
      query: 'product quality issue',
      page: lockBase + 1,
      slot: 'gallery-2',
      fallbackKeywords: ['product', 'quality', 'issue'],
      fallbackLock: lockBase + 1,
    }),
  ]);
}

export { hasStockPhotoApiKey };
