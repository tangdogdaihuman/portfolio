import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import db, { ensureMigrated } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const sectionSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  sortOrder: z.number().optional(),
});

export async function GET() {
  await ensureMigrated();
  const result = await db.execute(
    "SELECT id, title, content, sort_order, updated_at FROM detail_sections ORDER BY sort_order ASC, created_at ASC"
  );
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const parsed = sectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = createId();
  await db.execute({
    sql: `INSERT INTO detail_sections (id, title, content, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM detail_sections))`,
    args: [id, parsed.data.title, parsed.data.content],
  });

  return NextResponse.json({ id });
}
