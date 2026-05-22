import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "admin_token";
const MAX_AGE = 60 * 60 * 24 * 7;

function signToken(secret: string): string {
  const ts = Date.now().toString();
  const hmac = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  return `${ts}.${hmac}`;
}

function verifyToken(token: string, secret: string): boolean {
  const [ts, hmac] = token.split(".");
  if (!ts || !hmac) return false;
  const expected = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  try {
    const a = Buffer.from(hmac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const { pathname } = url;
  const secret = process.env.ADMIN_SECRET_KEY;

  if (!secret) return NextResponse.next();

  if (pathname === "/admin/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const keyParam = url.searchParams.get("key");
  if (keyParam) {
    const a = Buffer.from(keyParam);
    const b = Buffer.from(secret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      const token = signToken(secret);
      const response = NextResponse.redirect(new URL("/admin", req.url));
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: MAX_AGE,
        path: "/",
      });
      return response;
    }
  }

  const token = req.cookies.get(COOKIE_NAME);
  if (!token || !verifyToken(token.value, secret)) {
    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: ["/admin/:path*"],
};
