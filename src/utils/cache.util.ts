import crypto from 'crypto';
import logger from '#config/logger';
import { getRedisClient, isRedisReady } from '#config/redis';
import { REDIS_KEY_PREFIX } from '#utils/env.util';

export const hashQuery = (value: unknown): string =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

export const buildCacheKey = (...parts: string[]): string =>
  `${REDIS_KEY_PREFIX}:${parts.join(':')}`;

export const cacheKeys = {
  categoryList: (params: Record<string, unknown>) =>
    buildCacheKey('cat', 'list', hashQuery(params)),
  categoryById: (id: string) => buildCacheKey('cat', 'id', id),
  gisRegions: (level: string, parentId: string | undefined, search: string | undefined) =>
    buildCacheKey('gis', level, parentId ?? '_', hashQuery(search ?? '')),
  sysConstants: () => buildCacheKey('sys', 'constants'),
  sysSupport: () => buildCacheKey('sys', 'support'),
  policyList: () => buildCacheKey('policy', 'list'),
  policyByKey: (key: string) => buildCacheKey('policy', 'key', key),
  faqList: (page: number, limit: number) =>
    buildCacheKey('faq', 'list', String(page), String(limit)),
  payChannels: () => buildCacheKey('pay', 'channels'),
  shipCouriers: () => buildCacheKey('ship', 'couriers'),
  shipVehicles: () => buildCacheKey('ship', 'vehicles'),
  shipDest: (keyword: string, limit?: number, offset?: number) =>
    buildCacheKey('ship', 'dest', keyword.toLowerCase(), String(limit ?? 20), String(offset ?? 0)),
  prodCollections: () => buildCacheKey('prod', 'collections', 'meta'),
  /** Agregat admin — jangan dipakai untuk stok/produk live */
  adminDashStats: () => buildCacheKey('admin', 'dash', 'stats'),
  adminBiomassTrend: () => buildCacheKey('admin', 'dash', 'biomass'),
  adminRevenue: () => buildCacheKey('admin', 'dash', 'revenue'),
  adminUsersChart: () => buildCacheKey('admin', 'dash', 'users'),
  adminCategoriesChart: () => buildCacheKey('admin', 'dash', 'categories'),
  adminTopSuppliers: () => buildCacheKey('admin', 'dash', 'suppliers'),
  adminPlatformAnalytics: () => buildCacheKey('admin', 'dash', 'platform'),
  adminVisualGallery: () => buildCacheKey('admin', 'dash', 'gallery'),
  adminOrderAnalytics: () => buildCacheKey('admin', 'orders', 'stats'),
  adminIntegrationHealth: () => buildCacheKey('admin', 'orders', 'integ'),
  adminFinanceStats: () => buildCacheKey('admin', 'finance', 'stats'),
  adminFinanceFees: () => buildCacheKey('admin', 'finance', 'fees'),
  adminCrmOverview: () => buildCacheKey('admin', 'crm', 'overview'),
};

type MemoryEntry = { expiresAt: number; payload: string };
const memoryStore = new Map<string, MemoryEntry>();
const MEMORY_MAX_KEYS = 250;

const memoryGet = <T>(key: string): T | null => {
  const hit = memoryStore.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  try {
    return JSON.parse(hit.payload) as T;
  } catch {
    memoryStore.delete(key);
    return null;
  }
};

const memorySet = (key: string, ttlSeconds: number, data: unknown): void => {
  if (memoryStore.size >= MEMORY_MAX_KEYS) {
    const oldest = memoryStore.keys().next().value;
    if (oldest) memoryStore.delete(oldest);
  }
  memoryStore.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload: JSON.stringify(data),
  });
};

/**
 * Cache-aside: L1 memory (selalu) + Redis jika ready.
 * Miss → loader → tulis. Cocok untuk agregat; jangan cache stok produk.
 */
export const cacheAside = async <T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> => {
  const fromMemory = memoryGet<T>(key);
  if (fromMemory !== null) {
    logger.debug(`[Cache] MEM HIT ${key}`);
    return fromMemory;
  }

  if (isRedisReady()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(key);
        if (cached !== null) {
          logger.debug(`[Cache] REDIS HIT ${key}`);
          const parsed = JSON.parse(cached) as T;
          memorySet(key, ttlSeconds, parsed);
          return parsed;
        }
        logger.debug(`[Cache] MISS ${key}`);
      } catch (err) {
        logger.warn(`[Cache] Read gagal ${key}:`, err);
      }
    }
  }

  const data = await loader();
  memorySet(key, ttlSeconds, data);

  if (isRedisReady()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.setEx(key, ttlSeconds, JSON.stringify(data));
      } catch (err) {
        logger.warn(`[Cache] Write gagal ${key}:`, err);
      }
    }
  }

  return data;
};

export const invalidateByPrefix = async (relativePrefix: string): Promise<number> => {
  for (const key of [...memoryStore.keys()]) {
    if (key.includes(`:${relativePrefix}`) || key.endsWith(`:${relativePrefix.replace(/:$/, '')}`)) {
      memoryStore.delete(key);
    }
  }

  if (!isRedisReady()) return 0;
  const redis = getRedisClient();
  if (!redis) return 0;

  const pattern = `${REDIS_KEY_PREFIX}:${relativePrefix}*`;
  let deleted = 0;

  try {
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await redis.del(key);
      deleted += 1;
    }
    if (deleted > 0) {
      logger.info(`[Cache] Invalidated ${deleted} keys (${pattern})`);
    }
  } catch (err) {
    logger.warn(`[Cache] Invalidate gagal ${pattern}:`, err);
  }

  return deleted;
};

export const invalidateCategories = () => invalidateByPrefix('cat:');
export const invalidateGis = () => invalidateByPrefix('gis:');
export const invalidateSysSupport = () => invalidateByPrefix('sys:support');
export const invalidatePolicies = () => invalidateByPrefix('policy:');
export const invalidateFaqs = () => invalidateByPrefix('faq:');
export const invalidatePayChannels = () => invalidateByPrefix('pay:channels');
export const invalidateShippingConfig = async () => {
  await invalidateByPrefix('ship:couriers');
  await invalidateByPrefix('ship:vehicles');
};
export const invalidateProductCollections = () => invalidateByPrefix('prod:collections:');
export const invalidateAdminAnalytics = () => invalidateByPrefix('admin:');
