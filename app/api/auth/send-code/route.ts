import { NextRequest } from "next/server";
import { rateLimit, requireSameOrigin } from "@/lib/api-security";
import { sendVerificationCode } from "@/lib/email";
import { isRateLimited, setRateLimit, generateCode } from "@/lib/verification-codes";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    // 全局限流：每 IP 每分钟最多 3 次发送请求
    const limited = await rateLimit(req, "send-code", 3, 60 * 1000);
    if (limited) {
      reportMetric({ scope: "sendcode.rate_limited", value: 1, path: req.nextUrl.pathname });
      return limited;
    }

    // 发送频率限制：每 IP 60 秒内只能发一次
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    if (isRateLimited(ip)) {
      return fail("RATE_LIMITED", "发送过于频繁，请60秒后再试", 429);
    }

    const code = generateCode(ip);
    const sent = await sendVerificationCode(code);

    if (!sent) {
      reportApiError({
        scope: "sendcode.send_failed",
        message: "Email send failed",
        path: req.nextUrl.pathname,
      });
      return fail("SERVER_ERROR", "邮件发送失败，请确认服务端邮箱配置正确", 500);
    }

    setRateLimit(ip);
    reportMetric({ scope: "sendcode.success", value: 1, path: req.nextUrl.pathname });
    return ok({ sent: true });
  } catch (error) {
    reportApiError({
      scope: "sendcode.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "服务器错误", 500);
  }
}
