import { NextRequest, NextResponse } from "next/server";
import { getRateLimitStore } from "@/lib/rate-limit-store";
import { getClientIp } from "@/lib/client-ip";
import { fail } from "@/lib/api-response";
import { reportApiError } from "@/lib/monitoring";

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
  const bucketKey = `${key}:${getClientIp(req)}`;
  const now = Date.now();
  let bucket: { count: number; resetAt: number };
  try {
    bucket = await getRateLimitStore().increment(bucketKey, windowMs, now);
  } catch (error) {
    reportApiError({
      scope: "rate-limit",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return fail("RATE_LIMITED", "Too many requests", 429);
  }
  if (bucket.count > limit) {
    return fail("RATE_LIMITED", "Too many requests", 429);
  }

  return null;
}
