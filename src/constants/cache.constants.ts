/** TTL seconds per cache domain (Tier A — data jarang berubah). */
export const CACHE_TTL = {
  CATEGORY: 6 * 3600,
  GIS: 24 * 3600,
  SYS_CONSTANTS: 24 * 3600,
  SYS_SUPPORT: 3600,
  POLICY: 6 * 3600,
  FAQ: 6 * 3600,
  PAY_CHANNELS: 3600,
  SHIP_COURIERS: 6 * 3600,
  SHIP_VEHICLES: 6 * 3600,
  SHIP_DEST: 24 * 3600,
  PROD_COLLECTIONS: 3600,
  /** Featured / reco — katalog publik, bukan stok live */
  PROD_FEATURED: 10 * 60,
  PROD_RECOMMENDATIONS: 15 * 60,
  /** List publik — TTL pendek (≥ stok di response, ≤ 60s) */
  PROD_LIST: 45,
  AUTH_USER: 45,
  FORUM_LIST: 45,
  FORUM_GROUPS: 60,
  /** Agregat dashboard/CRM/finance — short TTL, bukan stok produk */
  ADMIN_ANALYTICS: 60,
  ADMIN_GALLERY: 120,
} as const;

export const CACHE_PREFIX = {
  CATEGORY: 'cat',
  GIS: 'gis',
  SYS: 'sys',
  POLICY: 'policy',
  FAQ: 'faq',
  PAY: 'pay',
  SHIP: 'ship',
  PROD: 'prod',
} as const;
