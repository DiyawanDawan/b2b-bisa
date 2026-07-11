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
};

/**
 * Cache-aside: miss → loader → SETEX. Redis down → loader langsung (degraded).
 */
export const cacheAside = async <T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> => {
  if (!isRedisReady()) {
    return loader();
  }

  const redis = getRedisClient();
  if (!redis) return loader();

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      logger.debug(`[Cache] HIT ${key}`);
      return JSON.parse(cached) as T;
    }
    logger.debug(`[Cache] MISS ${key}`);
  } catch (err) {
    logger.warn(`[Cache] Read gagal ${key}:`, err);
    return loader();
  }

  const data = await loader();

  try {
    await redis.setEx(key, ttlSeconds, JSON.stringify(data));
  } catch (err) {
    logger.warn(`[Cache] Write gagal ${key}:`, err);
  }

  return data;
};

export const invalidateByPrefix = async (relativePrefix: string): Promise<number> => {
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
