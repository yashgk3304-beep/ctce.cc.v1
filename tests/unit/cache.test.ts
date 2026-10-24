import { describe, expect, it } from 'vitest';
import { CACHE_MAX_ENTRIES, LruCache } from '../../src/background/cache';

describe('LruCache', () => {
  it('evicts oldest when over max', () => {
    const cache = new LruCache<string>(3, 60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.get('a');
    cache.set('d', '4');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1');
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it('expires by TTL', () => {
    const cache = new LruCache<string>(10, 1000);
    cache.set('x', 'y', Date.now() - 5000);
    expect(cache.get('x')).toBeUndefined();
  });

  it('default max is 200', () => {
    expect(CACHE_MAX_ENTRIES).toBe(200);
  });

  it('loadFromStorage drops expired', () => {
    const cache = new LruCache<string>(10, 100);
    cache.loadFromStorage([
      { key: 'old', value: 'v', createdAt: 0, lastAccessAt: 0 },
      { key: 'new', value: 'v2', createdAt: Date.now(), lastAccessAt: Date.now() },
    ]);
    expect(cache.get('old')).toBeUndefined();
    expect(cache.get('new')).toBe('v2');
  });
});
