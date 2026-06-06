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
