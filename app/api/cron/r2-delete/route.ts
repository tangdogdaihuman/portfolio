import crypto from "crypto";
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { processR2DeleteJobs } from "@/lib/r2-delete-jobs";

function safeEqual(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail("FORBIDDEN", "Cron trigger is disabled", 403);
  }

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const header = req.headers.get("x-cron-secret")?.trim() || "";
  const token = bearer || header;
  if (!token || !safeEqual(token, secret)) {
    return fail("UNAUTHORIZED", "Unauthorized", 401);
  }

  return null;
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const rawLimit = req.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : 20;
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(100, Math.floor(parsedLimit)))
    : 20;

  const result = await processR2DeleteJobs(limit);
  return ok({
    triggeredAt: new Date().toISOString(),
    limit,
    ...result,
  });
}
