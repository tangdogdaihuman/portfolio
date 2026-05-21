import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  thumbUrl: z.string().url().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await db.execute({
    sql: "SELECT * FROM works WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = result.rows[0];
  const work = {
    ...row,
    tags: row.tags ? (row.tags as string).split(",").filter(Boolean) : [],
    pinned: Boolean(row.pinned),
  };
  return NextResponse.json(work);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: string[] = [];
  const args: (string | number)[] = [];

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      const col = key
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/image_url/, "image_url")
        .replace(/thumb_url/, "thumb_url")
        .replace(/sort_order/, "sort_order");
      if (key === "tags") {
        updates.push("tags = ?");
        args.push((value as string[]).join(","));
      } else if (key === "pinned") {
        updates.push("pinned = ?");
        args.push(value ? 1 : 0);
      } else {
        updates.push(`${col} = ?`);
        args.push(value as string | number);
      }
    }
  }

  updates.push("updated_at = datetime('now')");
  args.push(id);

  await db.execute({
    sql: `UPDATE works SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await db.execute({ sql: "DELETE FROM works WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
