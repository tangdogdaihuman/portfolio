import { NextRequest, NextResponse } from "next/server";
import { getRateLimitStore } from "@/lib/rate-limit-store";
import { fail } from "@/lib/api-response";

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function hostnameFromHost(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : value;
  }
  if (value.includes("::")) return value;
  return value.split(":")[0];
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostnameFromHost(host));
}

export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (WRITE_METHODS.has(req.method)) {
      return fail("FORBIDDEN", "Origin missing", 403);
    }
    return null;
  }

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return fail("FORBIDDEN", "Origin mismatch", 403);
  }

  const host = req.headers.get("host") || new URL(req.url).host;
  if (hostnameFromHost(originHost) === hostnameFromHost(host)) return null;

  if (process.env.NODE_ENV !== "production" && isLoopbackHost(originHost) && isLoopbackHost(host)) {
    return null;
  }

  return fail("FORBIDDEN", "Origin mismatch", 403);
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
