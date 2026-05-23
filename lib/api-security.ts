import { NextRequest, NextResponse } from "next/server";
import { getRateLimitStore } from "@/lib/rate-limit-store";

export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  if (origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return null;
}
