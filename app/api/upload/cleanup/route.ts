import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";

const cleanupSchema = z.object({
  urls: z.array(z.string().url()).max(50),
});

export async function POST(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const parsed = cleanupSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await deleteFromR2(parsed.data.urls);
  return NextResponse.json({ ok: true });
}
