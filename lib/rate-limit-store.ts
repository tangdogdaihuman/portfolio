import db from "@/lib/db";
import { reportApiError } from "@/lib/monitoring";

type Bucket = { count: number; resetAt: number };

export interface RateLimitStore {
  increment(key: string, windowMs: number, now: number): Promise<Bucket>;
}

class DbRateLimitStore implements RateLimitStore {
  async increment(key: string, windowMs: number, now: number): Promise<Bucket> {
    const resetAt = now + windowMs;
    try {
      const res = await db.execute({
        sql: `INSERT INTO rate_limits (bucket_key, count, reset_at) VALUES (?, 1, ?)
              ON CONFLICT(bucket_key) DO UPDATE SET
                count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
                reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
              RETURNING count, reset_at`,
        args: [key, resetAt, now, now, resetAt],
      });
      const row = res.rows[0];
      return { count: Number(row.count), resetAt: Number(row.reset_at) };
    } catch (error) {
      reportApiError({
        scope: "rate-limit.store",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return { count: 1, resetAt };
    }
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

  singletonStore = new DbRateLimitStore();
  return singletonStore;
}

