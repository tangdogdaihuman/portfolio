import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db, { ensureMigrated } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const detailsSchema = z.object({
  content: z.string(),
});

export async function GET() {
  await ensureMigrated();
  const result = await db.execute("SELECT content, updated_at FROM details WHERE id = 1");
  const row = result.rows[0];
  return NextResponse.json({
    content: row?.content || "",
    updatedAt: row?.updated_at || "",
  });
}

export async function PUT(req: NextRequest) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const parsed = detailsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await ensureMigrated();
  await db.execute({
    sql: "UPDATE details SET content = ?, updated_at = datetime('now') WHERE id = 1",
    args: [parsed.data.content],
  });

  return NextResponse.json({ ok: true });
}
