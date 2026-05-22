import { cookies } from "next/headers";
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

export async function setAuthCookie() {
  const secret = process.env.ADMIN_SECRET_KEY!;
  const token = signToken(secret);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function verifyAuth(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME);
  if (!token) return false;
  return verifyToken(token.value, process.env.ADMIN_SECRET_KEY!);
}

export async function verifyAuthRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME);
  if (!token) return false;
  return verifyToken(token.value, process.env.ADMIN_SECRET_KEY!);
}

export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  if (await verifyAuthRequest(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
