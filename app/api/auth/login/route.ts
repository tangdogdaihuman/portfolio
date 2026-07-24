import { NextRequest } from "next/server";
import crypto from "crypto";
import { rateLimit, requireSameOrigin } from "@/lib/api-security";
import { setAuthCookie } from "@/lib/auth";
import { verifyCode } from "@/lib/verification-codes";
import { verifyTotp } from "@/lib/totp";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    reportMetric({ scope: "auth.login.invalid_body", value: 1, path: req.nextUrl.pathname });
    return fail("BAD_REQUEST", "Invalid body", 400);
  }

  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const configuredLoginRateLimit = Number(process.env.ADMIN_LOGIN_RATE_LIMIT || 10);
    const loginRateLimit = Number.isFinite(configuredLoginRateLimit) && configuredLoginRateLimit > 0
      ? Math.floor(configuredLoginRateLimit)
      : 10;
    const limited = await rateLimit(req, "admin-login", loginRateLimit, 5 * 60 * 1000);
    if (limited) {
      reportMetric({ scope: "auth.login.rate_limited", value: 1, path: req.nextUrl.pathname });
      return limited;
    }

    const payload = body as { key?: unknown; code?: unknown; token?: unknown };

    // --- 方式一：TOTP 动态口令 ---
    if (payload.token && typeof payload.token === "string") {
      const totpSecret = process.env.TOTP_SECRET;
      if (!totpSecret) {
        reportApiError({ scope: "auth.login.totp_config", message: "TOTP_SECRET missing", path: req.nextUrl.pathname });
        return fail("SERVER_ERROR", "TOTP 未配置，请先设置", 500);
      }
      if (!(await verifyTotp(payload.token, totpSecret))) {
        reportMetric({ scope: "auth.login.invalid_totp", value: 1, path: req.nextUrl.pathname });
        return fail("UNAUTHORIZED", "动态口令错误", 401);
      }
      await setAuthCookie();
      reportMetric({ scope: "auth.login.totp_success", value: 1, path: req.nextUrl.pathname });
      void writeAuditLog(req, "auth.login.totp_success");
      return ok({ loggedIn: true });
    }

    // --- 方式二：邮箱验证码 ---
    if (payload.code && typeof payload.code === "string") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";

      if (!verifyCode(ip, payload.code)) {
        reportMetric({ scope: "auth.login.invalid_code", value: 1, path: req.nextUrl.pathname });
        return fail("UNAUTHORIZED", "验证码错误或已过期", 401);
      }

      await setAuthCookie();
      reportMetric({ scope: "auth.login.code_success", value: 1, path: req.nextUrl.pathname });
      void writeAuditLog(req, "auth.login.code_success");
      return ok({ loggedIn: true });
    }

    // --- 方式三：管理员密钥 ---
    const key = payload.key;
    const secret = process.env.ADMIN_SECRET_KEY;
    if (!secret) {
      reportApiError({ scope: "auth.login.config", message: "ADMIN_SECRET_KEY missing", path: req.nextUrl.pathname });
      return fail("SERVER_ERROR", "Server not configured", 500);
    }
    if (!key || typeof key !== "string") {
      reportMetric({ scope: "auth.login.invalid_payload", value: 1, path: req.nextUrl.pathname });
      return fail("UNAUTHORIZED", "请输入密钥或验证码", 401);
    }

    const a = Buffer.from(key);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      reportMetric({ scope: "auth.login.invalid_key", value: 1, path: req.nextUrl.pathname });
      return fail("UNAUTHORIZED", "密钥错误", 401);
    }

    await setAuthCookie();
    reportMetric({ scope: "auth.login.success", value: 1, path: req.nextUrl.pathname });
    void writeAuditLog(req, "auth.login.success");
    return ok({ loggedIn: true });
  } catch (error) {
    reportApiError({
      scope: "auth.login.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "Server error", 500);
  }
}

