/**
 * LocalCache — in-memory TTL store.
 *
 * Used as a short-circuit for keys that are clearly under their limit,
 * reducing Redis round-trips by the configured TTL window (default 500ms).
 * Only "definitely allowed" results are cached; denials always hit Redis.
 */

interface CacheEntry {
  value: number;
  expiresAt: number;
}

export class LocalCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): number | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }

  /** Purge all expired entries — call periodically to prevent memory leak */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
