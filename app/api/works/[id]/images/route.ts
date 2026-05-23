import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";
import { writeAuditLog } from "@/lib/audit-log";

const addImageSchema = z.object({
  imageUrl: z.string().url(),
  thumbUrl: z.string().url(),
  imageSize: z.number().int().default(0),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await db.execute({
    sql: "SELECT * FROM work_images WHERE work_id = ? ORDER BY sort_order ASC, created_at ASC",
    args: [id],
  });
  if (result.rows.length > 0) return NextResponse.json(result.rows);

  const work = await db.execute({
    sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
    args: [id],
  });
  if (work.rows.length > 0 && work.rows[0].image_url) {
    return NextResponse.json([{
      id: "",
      work_id: id,
      image_url: work.rows[0].image_url,
      thumb_url: work.rows[0].thumb_url,
      sort_order: 0,
      image_size: 0,
      created_at: "",
    }]);
  }
  return NextResponse.json([]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id: workId } = await params;
  const body = await req.json();

  const items = Array.isArray(body) ? body : [body];
  const valid: { id: string; imageUrl: string; thumbUrl: string; imageSize: number }[] = [];
  for (const item of items) {
    const parsed = addImageSchema.safeParse(item);
    if (!parsed.success) continue;
    valid.push({
      id: createId(),
      imageUrl: parsed.data.imageUrl,
      thumbUrl: parsed.data.thumbUrl,
      imageSize: parsed.data.imageSize,
    });
  }

  if (valid.length > 0) {
    await db.batch(
      valid.map((it, i) => ({
        sql: `INSERT INTO work_images (id, work_id, image_url, thumb_url, sort_order, image_size)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [it.id, workId, it.imageUrl, it.thumbUrl, i, it.imageSize],
      }))
    );

    const work = await db.execute({
      sql: "SELECT image_url FROM works WHERE id = ?",
      args: [workId],
    });
    if (work.rows.length > 0 && !work.rows[0].image_url) {
      const first = valid[0];
      await db.execute({
        sql: "UPDATE works SET image_url = ?, thumb_url = ? WHERE id = ?",
        args: [first.imageUrl, first.thumbUrl, workId],
      });
    }
  }

  await writeAuditLog(req, "work.images.add", { workId, added: valid.length });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  return NextResponse.json({ ids: valid.map((v) => v.id) }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id: workId } = await params;
  const keepFiles = new URL(req.url).searchParams.get("keepFiles") === "true";
  const images = await db.execute({
    sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ?",
    args: [workId],
  });
  const urls: string[] = [];
  for (const row of images.rows) {
    if (row.image_url) urls.push(row.image_url as string);
    if (row.thumb_url) urls.push(row.thumb_url as string);
  }
  await db.execute({ sql: "DELETE FROM work_images WHERE work_id = ?", args: [workId] });
  if (!keepFiles) {
    deleteFromR2(urls).catch(() => {});
  }
  await writeAuditLog(req, "work.images.clear", { workId, removed: images.rows.length, keepFiles });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id: workId } = await params;
  const body = await req.json();
  const items = Array.isArray(body) ? body : [];

  const valid: { id: string; imageUrl: string; thumbUrl: string; imageSize: number; sortOrder: number }[] = [];
  for (const [i, item] of items.entries()) {
    const parsed = addImageSchema.safeParse(item);
    if (!parsed.success) continue;
    valid.push({
      id: createId(),
      imageUrl: parsed.data.imageUrl,
      thumbUrl: parsed.data.thumbUrl,
      imageSize: parsed.data.imageSize,
      sortOrder: parsed.data.sortOrder ?? i,
    });
  }

  const existing = await db.execute({
    sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ?",
    args: [workId],
  });

  const newUrls = new Set(valid.flatMap((it) => [it.imageUrl, it.thumbUrl]));
  const removedUrls: string[] = [];
  for (const row of existing.rows) {
    const imageUrl = row.image_url as string;
    const thumbUrl = row.thumb_url as string;
    if (imageUrl && !newUrls.has(imageUrl)) removedUrls.push(imageUrl);
    if (thumbUrl && !newUrls.has(thumbUrl)) removedUrls.push(thumbUrl);
  }

  await db.execute({ sql: "DELETE FROM work_images WHERE work_id = ?", args: [workId] });
  if (valid.length > 0) {
    await db.batch(
      valid.map((it) => ({
        sql: `INSERT INTO work_images (id, work_id, image_url, thumb_url, sort_order, image_size)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [it.id, workId, it.imageUrl, it.thumbUrl, it.sortOrder, it.imageSize],
      }))
    );
  }

  const cover = valid.sort((a, b) => a.sortOrder - b.sortOrder)[0];
  await db.execute({
    sql: "UPDATE works SET image_url = ?, thumb_url = ?, updated_at = datetime('now') WHERE id = ?",
    args: [cover?.imageUrl || "", cover?.thumbUrl || "", workId],
  });

  if (removedUrls.length > 0) {
    deleteFromR2(removedUrls).catch(() => {});
  }

  await writeAuditLog(req, "work.images.replace", {
    workId,
    previousCount: existing.rows.length,
    nextCount: valid.length,
    removedFiles: removedUrls.length,
  });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  return NextResponse.json({ ok: true, count: valid.length });
}
