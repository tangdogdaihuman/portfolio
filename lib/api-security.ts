import { NextRequest, NextResponse } from "next/server";
import { getRateLimitStore } from "@/lib/rate-limit-store";
import { fail } from "@/lib/api-response";

export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
      return fail("FORBIDDEN", "Origin missing", 403);
    }
    return null;
  }

  if (origin !== new URL(req.url).origin) {
    return fail("FORBIDDEN", "Origin mismatch", 403);
  }

  return null;
}

export async function rateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = await getRateLimitStore().increment(bucketKey, windowMs, now);
  if (bucket.count > limit) {
    return fail("RATE_LIMITED", "Too many requests", 429);
  }

  return null;
}
