import { buildCacheKey, cacheAside, hashQuery } from '../../src/utils/cache.util';

describe('cache.util', () => {
  it('hashQuery is stable for same input', () => {
    expect(hashQuery({ a: 1, b: 'x' })).toBe(hashQuery({ a: 1, b: 'x' }));
  });

  it('buildCacheKey uses REDIS_KEY_PREFIX', () => {
    expect(buildCacheKey('cat', 'list', 'abc')).toMatch(/^bisa:v1:cat:list:abc$/);
  });

  it('cacheAside calls loader when redis disabled', async () => {
    let calls = 0;
    const result = await cacheAside('bisa:v1:test:disabled', 60, async () => {
      calls += 1;
      return { ok: true };
    });
    expect(calls).toBe(1);
    expect(result).toEqual({ ok: true });
  });
});
