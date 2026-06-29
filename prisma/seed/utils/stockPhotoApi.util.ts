import fetch from 'node-fetch';
import logger from '../../../src/config/logger.js';
import { optional } from '../../../src/utils/env.util.ts';

const PEXELS_API_KEY = optional('PEXELS_API_KEY');
const PIXABAY_API_KEY = optional('PIXABAY_API_KEY');

const imageSearchCache = new Map<string, string[]>();
const videoSearchCache = new Map<string, string[]>();

export const BIOMASS_STOCK_QUERIES: Record<string, string> = {
  // Pexels: query "biochar" sudah cukup banyak hasil (lebih stabil daripada kata kunci panjang).
  BIOCHAR: 'biochar',
  SEKAM_PADI: 'rice husk biomass',
  TONGKOL_JAGUNG: 'corn stover harvest',
  TEMPURUNG_KELAPA: 'coconut shell biomass',
  WOOD_CHIP: 'wood chips biomass',
};

/** Variasi query biochar per grade — tetap fallback ke "biochar" jika kosong. */
const BIOCHAR_GRADE_STOCK_QUERIES: Record<string, string> = {
  A: 'biochar premium',
  B: 'biochar charcoal',
  C: 'biochar biomass',
};

export const ORGANIC_STOCK_QUERIES: Record<string, string> = {
  'Beras Organik': 'organic rice harvest',
  'Jagung Premium': 'sweet corn harvest',
  'Kentang Organik': 'organic potato farm',
  'Sayur Hijau': 'organic green vegetables',
  'Biji-bijian': 'soybean harvest',
  'Buah-buahan': 'organic tropical fruit',
};

const BIOMASS_VIDEO_QUERIES: Record<string, string> = {
  BIOCHAR: 'biochar',
  SEKAM_PADI: 'rice harvest agriculture',
  TONGKOL_JAGUNG: 'corn harvest field',
  TEMPURUNG_KELAPA: 'coconut farm agriculture',
  WOOD_CHIP: 'wood chips biomass',
};

const slotIndex = (slot: string): number => {
  if (slot === 'thumbnail' || slot === 'thumb') return 0;
  if (slot === 'gallery-1' || slot === 'img-0') return 1;
  if (slot === 'gallery-2' || slot === 'img-1') return 2;
  return 0;
};

const searchPexelsImages = async (query: string, page: number): Promise<string[]> => {
  if (!PEXELS_API_KEY) return [];

  try {
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '3');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
      headers: { Authorization: PEXELS_API_KEY },
      timeout: 25_000,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      photos?: Array<{ src?: { large?: string; medium?: string; large2x?: string } }>;
    };

    return (data.photos ?? [])
      .map((p) => p.src?.medium ?? p.src?.large ?? p.src?.large2x)
      .filter((u): u is string => !!u);
  } catch (err) {
    logger.warn(`[seed] Pexels image error (${query}): ${(err as Error).message}`);
    return [];
  }
};

const searchPixabayImages = async (query: string, page: number): Promise<string[]> => {
  if (!PIXABAY_API_KEY) return [];

  try {
    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', PIXABAY_API_KEY);
    url.searchParams.set('q', query);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('orientation', 'horizontal');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', '3');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), { timeout: 25_000 });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      hits?: Array<{ largeImageURL?: string; webformatURL?: string }>;
    };

    return (data.hits ?? [])
      .map((h) => h.webformatURL ?? h.largeImageURL)
      .filter((u): u is string => !!u);
  } catch (err) {
    logger.warn(`[seed] Pixabay image error (${query}): ${(err as Error).message}`);
    return [];
  }
};

const searchPexelsVideos = async (query: string, page: number): Promise<string[]> => {
  if (!PEXELS_API_KEY) return [];

  try {
    const url = new URL('https://api.pexels.com/videos/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '3');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
      headers: { Authorization: PEXELS_API_KEY },
      timeout: 25_000,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      videos?: Array<{
        video_files?: Array<{ link?: string; width?: number; file_type?: string }>;
      }>;
    };

    const urls: string[] = [];
    for (const video of data.videos ?? []) {
      const files = [...(video.video_files ?? [])].sort(
        (a, b) => (a.width ?? 0) - (b.width ?? 0),
      );
      const pick =
        files.find((f) => f.file_type === 'video/mp4' && (f.width ?? 0) >= 720) ??
        files.find((f) => f.file_type === 'video/mp4') ??
        files[0];
      if (pick?.link) urls.push(pick.link);
    }
    return urls;
  } catch (err) {
    logger.warn(`[seed] Pexels video error (${query}): ${(err as Error).message}`);
    return [];
  }
};

const searchPixabayVideos = async (query: string, page: number): Promise<string[]> => {
  if (!PIXABAY_API_KEY) return [];

  try {
    const url = new URL('https://pixabay.com/api/videos/');
    url.searchParams.set('key', PIXABAY_API_KEY);
    url.searchParams.set('q', query);
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', '3');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), { timeout: 25_000 });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      hits?: Array<{ videos?: { medium?: { url?: string }; small?: { url?: string } } }>;
    };

    return (data.hits ?? [])
      .map((h) => h.videos?.medium?.url ?? h.videos?.small?.url)
      .filter((u): u is string => !!u);
  } catch (err) {
    logger.warn(`[seed] Pixabay video error (${query}): ${(err as Error).message}`);
    return [];
  }
};

export const searchStockImageUrls = async (query: string, page: number): Promise<string[]> => {
  const cacheKey = `img:${query}:${page}`;
  const cached = imageSearchCache.get(cacheKey);
  if (cached) return cached;

  let urls = await searchPexelsImages(query, page);
  if (urls.length === 0) urls = await searchPixabayImages(query, page);

  imageSearchCache.set(cacheKey, urls);
  return urls;
};

export const searchStockVideoUrls = async (query: string, page: number): Promise<string[]> => {
  const cacheKey = `vid:${query}:${page}`;
  const cached = videoSearchCache.get(cacheKey);
  if (cached) return cached;

  let urls = await searchPexelsVideos(query, page);
  if (urls.length === 0) urls = await searchPixabayVideos(query, page);

  videoSearchCache.set(cacheKey, urls);
  return urls;
};

const IMAGE_DOWNLOAD_TIMEOUT_MS = 25_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 90_000;

const downloadFromUrl = async (
  url: string,
  defaultExt: string,
  timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> => {
  try {
    const res = await fetch(url, { timeout: timeoutMs, redirect: 'follow' });
    if (!res.ok) return null;

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
    let ext = defaultExt;
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('mp4')) ext = 'mp4';
    else if (contentType.includes('webm')) ext = 'webm';

    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: contentType || (defaultExt === 'mp4' ? 'video/mp4' : 'image/jpeg'),
      ext,
    };
  } catch (err) {
    logger.warn(`[seed] Download gagal (${timeoutMs / 1000}s): ${(err as Error).message}`);
    return null;
  }
};

const downloadFirstAvailable = async (
  urls: string[],
  defaultExt: string,
  timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> => {
  for (const url of urls) {
    const payload = await downloadFromUrl(url, defaultExt, timeoutMs);
    if (payload) return payload;
  }
  return null;
};

export const downloadStockImage = async (
  query: string,
  page: number,
  slot: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> => {
  const urls = await searchStockImageUrls(query, page);
  if (urls.length === 0) return null;

  const start = slotIndex(slot) % urls.length;
  const rotated = [...urls.slice(start), ...urls.slice(0, start)];
  return downloadFirstAvailable(rotated, 'jpg', IMAGE_DOWNLOAD_TIMEOUT_MS);
};

export const downloadStockVideo = async (
  query: string,
  page: number,
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> => {
  const urls = await searchStockVideoUrls(query, page);
  if (urls.length === 0) return null;
  return downloadFirstAvailable(urls, 'mp4', VIDEO_DOWNLOAD_TIMEOUT_MS);
};

export const resolveStockQuery = (
  kind: 'biomass' | 'organic',
  key: string,
  grade?: string | null,
): string => {
  if (kind === 'biomass') {
    if (key === 'BIOCHAR' && grade) {
      return BIOCHAR_GRADE_STOCK_QUERIES[grade] ?? BIOMASS_STOCK_QUERIES.BIOCHAR;
    }
    return BIOMASS_STOCK_QUERIES[key] ?? BIOMASS_STOCK_QUERIES.BIOCHAR;
  }
  return ORGANIC_STOCK_QUERIES[key] ?? 'organic agriculture harvest';
};

export const resolveStockVideoQuery = (
  kind: 'biomass' | 'organic',
  key: string,
  grade?: string | null,
): string => {
  if (kind === 'biomass') {
    if (key === 'BIOCHAR') {
      return BIOMASS_VIDEO_QUERIES.BIOCHAR;
    }
    return BIOMASS_VIDEO_QUERIES[key] ?? `${BIOMASS_STOCK_QUERIES[key] ?? 'biomass'} video`;
  }
  return `${ORGANIC_STOCK_QUERIES[key] ?? 'organic agriculture'} video`;
};

export const hasStockPhotoApiKey = (): boolean =>
  Boolean(PEXELS_API_KEY || PIXABAY_API_KEY);
