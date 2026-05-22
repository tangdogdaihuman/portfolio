import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import db, { ensureMigrated } from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const sectionSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  sortOrder: z.number().optional(),
});

export async function GET() {
  await ensureMigrated();
  await db.execute(`CREATE TABLE IF NOT EXISTS detail_sections (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`).catch(() => {});
  const result = await db.execute("SELECT id, title, content, sort_order, updated_at FROM detail_sections ORDER BY sort_order ASC, created_at ASC");
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = sectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await ensureMigrated();
  await db.execute(`CREATE TABLE IF NOT EXISTS detail_sections (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`).catch(() => {});

  const id = createId();
  await db.execute({
    sql: `INSERT INTO detail_sections (id, title, content, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM detail_sections))`,
    args: [id, parsed.data.title, parsed.data.content],
  });

  return NextResponse.json({ id });
}
