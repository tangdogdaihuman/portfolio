import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const introSchema = z.object({
  content: z.string(),
});

export async function GET() {
  const result = await db.execute("SELECT content, updated_at FROM intro WHERE id = 1");
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
  const parsed = introSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db.execute({
    sql: "UPDATE intro SET content = ?, updated_at = datetime('now') WHERE id = 1",
    args: [parsed.data.content],
  });

  return NextResponse.json({ ok: true });
}
