import { LocalCache } from '../../src/services/localCache';

describe('LocalCache', () => {
  let cache: LocalCache;

  beforeEach(() => {
    cache = new LocalCache(100); // 100ms TTL
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns the stored value', () => {
    cache.set('key1', 42);
    expect(cache.get('key1')).toBe(42);
  });

  it('returns undefined after TTL expires', async () => {
    cache.set('key2', 99);
    await new Promise((r) => setTimeout(r, 150));
    expect(cache.get('key2')).toBeUndefined();
  });

  it('tracks size correctly', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
  });

  it('deletes a key', () => {
    cache.set('del', 5);
    cache.delete('del');
    expect(cache.get('del')).toBeUndefined();
  });

  it('evictExpired removes stale entries', async () => {
    cache.set('stale', 1);
    await new Promise((r) => setTimeout(r, 150));
    cache.evictExpired();
    expect(cache.size()).toBe(0);
  });
});
