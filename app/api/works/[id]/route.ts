import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db, { tagsToArray, tagsToString } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";
import { reportApiError } from "@/lib/monitoring";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  thumbUrl: z.string().url().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  workDate: z.string().optional(),
  sizeWeight: z.number().min(0.5).max(2.0).optional(),
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
    tags: tagsToArray(row.tags),
    pinned: Boolean(row.pinned),
  };
  return NextResponse.json(work);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const updates: string[] = [];
    const args: (string | number)[] = [];

    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (key === "tags") {
        updates.push("tags = ?");
        args.push(tagsToString(value as string[]));
      } else if (key === "pinned") {
        updates.push("pinned = ?");
        args.push(value ? 1 : 0);
      } else {
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        updates.push(`${col} = ?`);
        args.push(value as string | number);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    args.push(id);

    const result = await db.execute({
      sql: `UPDATE works SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportApiError({
      scope: "works.update.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "更新作品失败" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;

    const { id } = await params;

    const urls: string[] = [];
    const work = await db.execute({
      sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
      args: [id],
    });
    if (work.rows.length > 0) {
      if (work.rows[0].image_url) urls.push(work.rows[0].image_url as string);
      if (work.rows[0].thumb_url) urls.push(work.rows[0].thumb_url as string);
    }
    const images = await db.execute({
      sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ?",
      args: [id],
    });
    for (const row of images.rows) {
      if (row.image_url) urls.push(row.image_url as string);
      if (row.thumb_url) urls.push(row.thumb_url as string);
    }

    await db.execute({ sql: "DELETE FROM work_images WHERE work_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM works WHERE id = ?", args: [id] });

    deleteFromR2(urls).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportApiError({
      scope: "works.delete.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "删除作品失败" }, { status: 500 });
  }
}
