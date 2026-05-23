import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";

const updateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sortOrder: z.number().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (parsed.data.title !== undefined) { sets.push("title = ?"); args.push(parsed.data.title); }
  if (parsed.data.content !== undefined) { sets.push("content = ?"); args.push(parsed.data.content); }
  if (parsed.data.sortOrder !== undefined) { sets.push("sort_order = ?"); args.push(parsed.data.sortOrder); }
  if (sets.length === 0) return NextResponse.json({ ok: true });

  sets.push("updated_at = datetime('now')");
  args.push(id);
  await db.execute({ sql: `UPDATE detail_sections SET ${sets.join(", ")} WHERE id = ?`, args });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id } = await params;
  await db.execute({ sql: "DELETE FROM detail_sections WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
