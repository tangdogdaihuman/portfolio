import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let key: string | null = null;

  // Support JSON body: { key: "xxx" }
  try {
    const body = await req.json();
    key = body.key;
  } catch {
    // Fallback to ?key= query param
    const { searchParams } = new URL(req.url);
    key = searchParams.get("key");
  }

  if (!key || key !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  await setAuthCookie();
  return NextResponse.json({ ok: true });
}
