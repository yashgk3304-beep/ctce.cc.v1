import { PROMPT_VERSION } from '../shared/types';

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  lastAccess: number;
}

const STORAGE_KEY = 'ctc_suggestion_cache_v1';
const MAX = 200;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure in-memory LRU for unit tests and runtime. */
export class SuggestionCache {
  private map = new Map<string, CacheEntry>();

  async hydrate(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const list = (raw[STORAGE_KEY] as CacheEntry[] | undefined) ?? [];
    const now = Date.now();
    this.map.clear();
    for (const e of list) {
      if (now - e.createdAt <= TTL_MS) this.map.set(e.key, e);
    }
  }

  private async persist(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: [...this.map.values()] });
    } catch {
      this.evict(Math.ceil(this.map.size / 4));
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: [...this.map.values()] });
      } catch {
        /* storage full — warn via caller */
      }
    }
  }

  get<T>(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() - e.createdAt > TTL_MS) {
      this.map.delete(key);
      void this.persist();
      return undefined;
    }
    e.lastAccess = Date.now();
    this.map.delete(key);
    this.map.set(key, e);
    return e.value as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.map.size >= MAX) this.evict(1);
    this.map.set(key, {
      key,
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    });
    await this.persist();
  }

  evict(n: number): void {
    const entries = [...this.map.values()].sort((a, b) => a.lastAccess - b.lastAccess);
    for (let i = 0; i < n && i < entries.length; i++) {
      const e = entries[i];
      if (e) this.map.delete(e.key);
    }
  }

  async clear(): Promise<void> {
    this.map.clear();
    await this.persist();
  }

  size(): number {
    return this.map.size;
  }
}

export { PROMPT_VERSION, MAX as CACHE_MAX, TTL_MS as CACHE_TTL_MS };
