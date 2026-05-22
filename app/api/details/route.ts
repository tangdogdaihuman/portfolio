import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const detailsSchema = z.object({
  content: z.string(),
});

async function ensureTable() {
  await db.execute(`CREATE TABLE IF NOT EXISTS details (id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1), content TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`).catch(() => {});
  await db.execute("INSERT OR IGNORE INTO details (id, content) VALUES (1, '')").catch(() => {});
}

export async function GET() {
  await ensureTable();
  const result = await db.execute("SELECT content, updated_at FROM details WHERE id = 1");
  const row = result.rows[0];
  return NextResponse.json({
    content: row?.content || "",
    updatedAt: row?.updated_at || "",
  });
}

export async function PUT(req: NextRequest) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = detailsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await ensureTable();
  await db.execute({
    sql: "UPDATE details SET content = ?, updated_at = datetime('now') WHERE id = 1",
    args: [parsed.data.content],
  });

  return NextResponse.json({ ok: true });
}
