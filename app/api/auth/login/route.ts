import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit, requireSameOrigin } from "@/lib/api-security";
import { setAuthCookie } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    reportMetric({ scope: "auth.login.invalid_body", value: 1, path: req.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const limited = await rateLimit(req, "admin-login", 10, 5 * 60 * 1000);
    if (limited) {
      reportMetric({ scope: "auth.login.rate_limited", value: 1, path: req.nextUrl.pathname });
      return limited;
    }

    const key = typeof body === "object" && body !== null ? (body as { key?: unknown }).key : null;
    const secret = process.env.ADMIN_SECRET_KEY;
    if (!secret) {
      reportApiError({ scope: "auth.login.config", message: "ADMIN_SECRET_KEY missing", path: req.nextUrl.pathname });
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    if (!key || typeof key !== "string") {
      reportMetric({ scope: "auth.login.invalid_payload", value: 1, path: req.nextUrl.pathname });
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    const a = Buffer.from(key);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      reportMetric({ scope: "auth.login.invalid_key", value: 1, path: req.nextUrl.pathname });
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    await setAuthCookie();
    reportMetric({ scope: "auth.login.success", value: 1, path: req.nextUrl.pathname });
    await writeAuditLog(req, "auth.login.success");
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportApiError({
      scope: "auth.login.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
