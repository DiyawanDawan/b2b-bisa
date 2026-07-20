/**
 * Path relatif di MySQL + resolve ke URL publik placeholder.
 * Path DB tetap `external/loremflickr/...` (kompatibel seed lama).
 * Resolve ke Picsum — LoremFlickr sering 5xx / hotlink block.
 *
 * DB: external/loremflickr/{w}/{h}/{keywords}/lock/{n}/random/{m}
 * API: https://picsum.photos/seed/bisa-lf-{lock}/.../{w}/{h}
 */

export const LOREM_FLICKR_DB_PREFIX = 'external/loremflickr/';

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

const encodeKeyword = (keyword: string): string =>
  String(keyword)
    .trim()
    .split(/\s+/)
    .map((part) => encodeURIComponent(part))
    .join('%20');

const formatKeywordSegment = (keywords: string | string[], matchAll = false): string => {
  const parts = (Array.isArray(keywords) ? keywords : [keywords]).map(encodeKeyword);
  const joined = parts.join(',');
  return matchAll && parts.length > 1 ? `${joined}/all` : joined;
};

export type LoremFlickrImageOpts = {
  width?: number;
  height?: number;
  lock?: number;
  random?: number;
  matchAll?: boolean;
};

/** Path yang disimpan di kolom thumbnail_url / product_image.url */
export const loremFlickrDbPath = (
  keywords: string | string[],
  opts: LoremFlickrImageOpts = {},
): string => {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const segment = formatKeywordSegment(keywords, opts.matchAll ?? false);
  const parts = [LOREM_FLICKR_DB_PREFIX.replace(/\/$/, ''), String(width), String(height), segment];
  if (opts.lock != null) parts.push('lock', String(opts.lock));
  if (opts.random != null) parts.push('random', String(opts.random));
  return parts.join('/');
};

const AVATAR_SIZE = 320;

const AVATAR_KEYWORD_POOL: string[][] = [
  ['portrait', 'person'],
  ['portrait', 'woman'],
  ['portrait', 'man'],
  ['portrait', 'business'],
];

/** Path DB untuk foto profil (persegi, keyword wajah). */
export const avatarSeedPath = (lock: number): string => {
  const keywords = AVATAR_KEYWORD_POOL[Math.abs(lock) % AVATAR_KEYWORD_POOL.length];
  return loremFlickrDbPath(keywords, {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    lock: lock + 1,
    matchAll: keywords.length > 1,
  });
};

export const isLoremFlickrDbPath = (value: string | null | undefined): boolean =>
  !!value?.trim().startsWith(LOREM_FLICKR_DB_PREFIX);

const picsumUrl = (width: string, height: string, seed: string): string => {
  const safeSeed = seed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'bisa';
  return `https://picsum.photos/seed/${safeSeed}/${width}/${height}`;
};

/** Ubah path DB → URL HTTPS untuk client (mobile/web). */
export const loremFlickrDbPathToUrl = (dbPath: string): string => {
  if (!isLoremFlickrDbPath(dbPath)) return dbPath;

  const rest = dbPath.slice(LOREM_FLICKR_DB_PREFIX.length);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length < 3) return dbPath;

  const width = segments[0];
  const height = segments[1];
  const keywordParts: string[] = [];
  let i = 2;
  while (i < segments.length && segments[i] !== 'lock' && segments[i] !== 'random') {
    keywordParts.push(segments[i]);
    i += 1;
  }

  let lock = '0';
  let random = '';
  if (segments[i] === 'lock' && segments[i + 1]) {
    lock = segments[i + 1];
    i += 2;
  }
  if (segments[i] === 'random' && segments[i + 1]) {
    random = segments[i + 1];
  }

  const kw = keywordParts
    .join('-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);
  const seed = `bisa-lf-${lock}${random ? `-r${random}` : ''}${kw ? `-${kw}` : ''}`;
  return picsumUrl(width, height, seed);
};

const ORGANIC_KEYWORDS_BY_CROP: Record<string, string[][]> = {
  'Beras Organik': [
    ['rice', 'harvest'],
    ['rice', 'plantation'],
    ['agriculture', 'farm'],
  ],
  'Jagung Premium': [
    ['corn', 'harvest'],
    ['corn', 'farm'],
    ['agriculture', 'harvest'],
  ],
  'Kentang Organik': [
    ['potato', 'vegetable'],
    ['potato', 'farm'],
    ['vegetable', 'harvest'],
  ],
  'Sayur Hijau': [
    ['vegetable', 'tomato'],
    ['vegetable', 'carrot'],
    ['vegetable', 'broccoli'],
    ['cucumber', 'vegetable'],
  ],
  'Biji-bijian': [
    ['soybean', 'farm'],
    ['corn', 'soybean'],
    ['wheat', 'harvest'],
  ],
  'Buah-buahan': [
    ['fruit', 'mango'],
    ['fruit', 'banana'],
    ['apple', 'fruit'],
    ['orange', 'fruit'],
    ['strawberry', 'fruit'],
  ],
};

const ORGANIC_FALLBACK: string[][] = [
  ['fruit', 'agriculture'],
  ['vegetable', 'farm'],
  ['rice', 'harvest'],
  ['agriculture', 'plantation'],
];

const BIOMASS_KEYWORDS_BY_TYPE: Record<string, string[][]> = {
  BIOCHAR: [
    ['biomass', 'pellet'],
    ['biomass', 'gasification'],
    ['biofuel', 'renewable energy'],
  ],
  SEKAM_PADI: [['rice husk'], ['rice husk', 'biomass'], ['organic waste', 'farm']],
  TONGKOL_JAGUNG: [['corn stover'], ['corn stover', 'biomass'], ['corn', 'harvest']],
  TEMPURUNG_KELAPA: [['palm oil', 'biomass'], ['empty fruit bunch'], ['palm kernel shell']],
  WOOD_CHIP: [['wood chips'], ['wood chips', 'sawdust'], ['sawdust', 'biomass']],
};

const BIOMASS_FALLBACK: string[][] = [
  ['biomass'],
  ['palm oil', 'biomass'],
  ['renewable energy', 'organic waste'],
];

type FakerLike = {
  helpers: { arrayElement: <T>(list: T[]) => T };
};

const pickOne = <T>(faker: FakerLike, list: T[]): T => faker.helpers.arrayElement(list);

export const productImageLock = (supplierId: string, productIndex: number): number => {
  let hash = productIndex + 1;
  for (let i = 0; i < supplierId.length; i += 1) {
    hash = (hash * 31 + supplierId.charCodeAt(i)) % 900_000;
  }
  return hash + 1;
};

export const organicProduceImagePaths = (faker: FakerLike, cropType: string, lockBase: number) => {
  const pool = ORGANIC_KEYWORDS_BY_CROP[cropType] ?? ORGANIC_FALLBACK;
  const thumbKeywords = pickOne(faker, pool);
  const galleryKeywords = pickOne(faker, pool);
  return {
    thumbnailUrl: loremFlickrDbPath(thumbKeywords, {
      lock: lockBase,
      matchAll: thumbKeywords.length > 1,
    }),
    images: [
      {
        url: loremFlickrDbPath(galleryKeywords, {
          lock: lockBase + 1,
          random: 1,
          matchAll: galleryKeywords.length > 1,
        }),
        isPrimary: true,
        order: 0,
      },
      {
        url: loremFlickrDbPath(pickOne(faker, ORGANIC_FALLBACK), {
          lock: lockBase + 2,
          random: 2,
        }),
        isPrimary: false,
        order: 1,
      },
    ],
  };
};

export const biomassImagePaths = (faker: FakerLike, biomassaType: string, lockBase: number) => {
  const pool = BIOMASS_KEYWORDS_BY_TYPE[biomassaType] ?? BIOMASS_FALLBACK;
  const thumbKeywords = pickOne(faker, pool);
  const primaryKeywords = pickOne(faker, pool);
  return {
    thumbnailUrl: loremFlickrDbPath(thumbKeywords, {
      lock: lockBase,
      matchAll: thumbKeywords.length > 1,
    }),
    images: [
      {
        url: loremFlickrDbPath(primaryKeywords, {
          lock: lockBase + 1,
          random: 1,
          matchAll: primaryKeywords.length > 1,
        }),
        isPrimary: true,
        order: 0,
      },
      {
        url: loremFlickrDbPath(pickOne(faker, BIOMASS_FALLBACK), {
          lock: lockBase + 2,
          random: 2,
        }),
        isPrimary: false,
        order: 1,
      },
    ],
  };
};
