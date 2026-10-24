export const CACHE_MAX_ENTRIES = 200;
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PROMPT_VERSION_CACHE = '1';

export interface CacheRecord<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  lastAccessAt: number;
}

const STORAGE_KEY = 'ctc_suggestion_cache_v1';

export class LruCache<T> {
  private map = new Map<string, CacheRecord<T>>();

  constructor(
    private readonly max = CACHE_MAX_ENTRIES,
    private readonly ttlMs = CACHE_TTL_MS,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() - e.createdAt > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    e.lastAccessAt = Date.now();
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T, createdAt = Date.now()): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, {
      key,
      value,
      createdAt,
      lastAccessAt: Date.now(),
    });
    while (this.map.size > this.max) {
      this.evictOldest(1);
    }
  }

  evictOldest(n: number): void {
    const entries = [...this.map.values()].sort((a, b) => a.lastAccessAt - b.lastAccessAt);
    for (let i = 0; i < n && i < entries.length; i++) {
      const e = entries[i];
      if (e) this.map.delete(e.key);
    }
  }

  loadFromStorage(entries: CacheRecord<T>[]): void {
    this.map.clear();
    const now = Date.now();
    for (const e of entries) {
      if (now - e.createdAt <= this.ttlMs) this.map.set(e.key, { ...e });
    }
  }

  toJSON(): CacheRecord<T>[] {
    return [...this.map.values()];
  }

  clear(): void {
    this.map.clear();
  }
}

/** chrome.storage-backed LRU used by the service worker. */
export class SuggestionCache {
  private inner = new LruCache<unknown>();
  private hydrated = false;

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const list = (raw[STORAGE_KEY] as CacheRecord[] | undefined) ?? [];
    this.inner.loadFromStorage(list);
  }

  private async persist(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.inner.toJSON() });
    } catch {
      this.inner.evictOldest(Math.ceil(this.inner.size / 4) || 1);
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: this.inner.toJSON() });
      } catch {
        /* storage full — caller may warn */
      }
    }
  }

  get<T>(key: string): T | undefined {
    return this.inner.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.inner.set(key, value);
    await this.persist();
  }

  evict(n: number): void {
    this.inner.evictOldest(n);
  }

  async clear(): Promise<void> {
    this.inner.clear();
    await this.persist();
  }

  size(): number {
    return this.inner.size;
  }
}
