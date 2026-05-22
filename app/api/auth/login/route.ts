import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let key: string | null = null;

  try {
    const body = await req.json();
    key = body.key;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  const a = Buffer.from(key);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  await setAuthCookie();
  return NextResponse.json({ ok: true });
}
