type Bucket = { count: number; resetAt: number };

export interface RateLimitStore {
  increment(key: string, windowMs: number, now: number): Promise<Bucket>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private lastCleanupAt = 0;
  private readonly cleanupIntervalMs = 60_000;

  private cleanup(now: number) {
    if (now - this.lastCleanupAt < this.cleanupIntervalMs) return;
    this.lastCleanupAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  async increment(key: string, windowMs: number, now: number): Promise<Bucket> {
    this.cleanup(now);
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      const created = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, created);
      return created;
    }

    const updated = { ...current, count: current.count + 1 };
    this.buckets.set(key, updated);
    return updated;
  }
}

class UpstashRateLimitStore implements RateLimitStore {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private async call(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash request failed: ${res.status}`);
    const json = await res.json();
    return json.result;
  }

  async increment(key: string, windowMs: number, now: number): Promise<Bucket> {
    const encoded = encodeURIComponent(key);
    const nextCount = Number(await this.call(`/incr/${encoded}`));
    if (!Number.isFinite(nextCount) || nextCount <= 0) {
      throw new Error("Invalid Upstash INCR response");
    }

    if (nextCount === 1) {
      await this.call(`/pexpire/${encoded}/${windowMs}`);
      return { count: 1, resetAt: now + windowMs };
    }

    const ttl = Number(await this.call(`/pttl/${encoded}`));
    if (!Number.isFinite(ttl) || ttl <= 0) {
      await this.call(`/pexpire/${encoded}/${windowMs}`);
      return { count: nextCount, resetAt: now + windowMs };
    }

    return { count: nextCount, resetAt: now + ttl };
  }
}

let singletonStore: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (singletonStore) return singletonStore;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    singletonStore = new UpstashRateLimitStore(url, token);
    return singletonStore;
  }

  singletonStore = new MemoryRateLimitStore();
  return singletonStore;
}

