import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "admin_token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function signToken(secret: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${secret}:${Date.now()}`);
  return Buffer.from(data).toString("base64");
}

function verifyToken(token: string, secret: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [stored] = decoded.split(":");
    return stored === secret;
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
