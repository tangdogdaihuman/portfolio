import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_token";
const MAX_AGE = 60 * 60 * 24 * 7;

function signToken(secret: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${secret}:${Date.now()}`);
  let binary = "";
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function verifyToken(token: string, secret: string): boolean {
  try {
    const decoded = atob(token);
    const [stored] = decoded.split(":");
    return stored === secret;
  } catch {
    return false;
  }
}

function proxy(req: NextRequest) {
  const { pathname, searchParams } = new URL(req.url);
  const secret = process.env.ADMIN_SECRET_KEY;

  if (!secret) return NextResponse.next();

  // Allow login page and auth API without cookie
  if (pathname === "/admin/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  // Allow ?key= URL login (bookmark), then redirect
  const key = searchParams.get("key");
  if (key && key === secret) {
    const response = NextResponse.redirect(new URL("/admin", req.url));
    response.cookies.set(COOKIE_NAME, signToken(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MAX_AGE,
      path: "/",
    });
    return response;
  }
  if (key && key !== secret) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  // Check cookie
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
