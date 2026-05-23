type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

class IdempotencyStore {
  private map = new Map<string, CacheEntry<unknown>>();
  private lastCleanupAt = 0;
  private readonly cleanupIntervalMs = 60_000;

  private cleanup(now: number) {
    if (now - this.lastCleanupAt < this.cleanupIntervalMs) return;
    this.lastCleanupAt = now;
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) this.map.delete(key);
    }
  }

  get<T>(key: string, now = Date.now()): T | null {
    this.cleanup(now);
    const entry = this.map.get(key);
    if (!entry || entry.expiresAt <= now) return null;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number, now = Date.now()) {
    this.cleanup(now);
    this.map.set(key, { value, expiresAt: now + ttlMs });
  }
}

const store = new IdempotencyStore();

export function getIdempotencyStore() {
  return store;
}

