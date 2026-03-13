/**
 * LocalCache<T> — generic in-memory TTL store.
 *
 * Used as a short-circuit for keys clearly under their limit (default: number)
 * and for policy lookups (RateLimitPolicy), reducing Redis/DB round-trips.
 * Only "definitely allowed" results are cached; denials always hit Redis.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LocalCache<T = number> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }

  /** Remove all expired entries. Call periodically to prevent memory growth. */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
