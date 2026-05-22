import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const updateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sortOrder: z.number().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAuthRequest(_req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await db.execute({ sql: "DELETE FROM detail_sections WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
