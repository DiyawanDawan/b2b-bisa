import { createClient, type RedisClientType } from 'redis';
import logger from '#config/logger';
import { REDIS_ENABLED, REDIS_URL } from '#utils/env.util';

let client: RedisClientType | null = null;
let ready = false;

export const isRedisReady = (): boolean => REDIS_ENABLED && ready && client !== null;

export const getRedisClient = (): RedisClientType | null => {
  if (!REDIS_ENABLED || !REDIS_URL) return null;
  return client;
};

export const connectRedis = async (): Promise<void> => {
  if (!REDIS_ENABLED || !REDIS_URL) {
    logger.info('[Redis] Disabled (REDIS_ENABLED=false or REDIS_URL empty).');
    return;
  }
  if (client) return;

  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err) => {
    ready = false;
    logger.warn('[Redis] Client error — cache bypass aktif:', err.message);
  });
  redis.on('connect', () => {
    logger.info('[Redis] Connected.');
  });
  redis.on('ready', () => {
    ready = true;
  });
  redis.on('end', () => {
    ready = false;
  });

  try {
    await redis.connect();
    client = redis as RedisClientType;
    ready = redis.isReady;
  } catch (err) {
    ready = false;
    client = null;
    logger.warn('[Redis] Connect gagal — cache bypass aktif:', err);
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // best-effort
  } finally {
    client = null;
    ready = false;
  }
};

export const pingRedis = async (): Promise<boolean> => {
  if (!isRedisReady() || !client) return false;
  try {
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
};
