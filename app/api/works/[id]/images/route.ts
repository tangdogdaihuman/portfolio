import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { enqueueR2DeleteInTransaction, processR2DeleteJobs } from "@/lib/r2-delete-jobs";
import {
  chooseCoverImage,
  collectRemovedImageUrls,
  replaceWorkImagesInTransaction,
  type PreparedWorkImage,
} from "@/lib/work-images-replace";

const addImageSchema = z.object({
  imageUrl: z.string().url(),
  thumbUrl: z.string().url(),
  mediaType: z.enum(["image", "video"]).default("image"),
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
  if (result.rows.length > 0) return ok(result.rows);

  const work = await db.execute({
    sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
    args: [id],
  });
  if (work.rows.length > 0 && work.rows[0].image_url) {
    return ok([{
      id: "",
      work_id: id,
      image_url: work.rows[0].image_url,
      thumb_url: work.rows[0].thumb_url,
      media_type: "image",
      sort_order: 0,
      image_size: 0,
      created_at: "",
    }]);
  }
  return ok([]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;
  void processR2DeleteJobs().catch(() => {});

  const { id: workId } = await params;
  const body = await req.json();

  const items = Array.isArray(body) ? body : [body];
  const valid: { id: string; imageUrl: string; thumbUrl: string; mediaType: string; imageSize: number }[] = [];
  for (const item of items) {
    const parsed = addImageSchema.safeParse(item);
    if (!parsed.success) continue;
    valid.push({
      id: createId(),
      imageUrl: parsed.data.imageUrl,
      thumbUrl: parsed.data.thumbUrl,
      mediaType: parsed.data.mediaType,
      imageSize: parsed.data.imageSize,
    });
  }

  if (valid.length > 0) {
    const transaction = await db.transaction("write");
    try {
      const work = await transaction.execute({
        sql: "SELECT image_url FROM works WHERE id = ?",
        args: [workId],
      });
      if (work.rows.length === 0) {
        await transaction.rollback();
        return fail("NOT_FOUND", "Work not found", 404);
      }

      const maxSort = await transaction.execute({
        sql: "SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM work_images WHERE work_id = ?",
        args: [workId],
      });
      const startSort = Number(maxSort.rows[0]?.max_sort ?? -1) + 1;

      await transaction.batch(
        valid.map((it, i) => ({
          sql: `INSERT INTO work_images (id, work_id, image_url, thumb_url, media_type, sort_order, image_size)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [it.id, workId, it.imageUrl, it.thumbUrl, it.mediaType, startSort + i, it.imageSize],
        }))
      );

      if (!work.rows[0].image_url) {
        const first = valid[0];
        await transaction.execute({
          sql: "UPDATE works SET image_url = ?, thumb_url = ? WHERE id = ?",
          args: [first.imageUrl, first.thumbUrl, workId],
        });
      }

      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      if (!transaction.closed) transaction.close();
    }
  }

  await writeAuditLog(req, "work.images.add", { workId, added: valid.length });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  revalidateTag("works", "max");
  revalidateTag(`work:${workId}`, "max");
  return ok({ ids: valid.map((v) => v.id) }, 201, "Created");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;
  void processR2DeleteJobs().catch(() => {});

  const { id: workId } = await params;
  const keepFiles = new URL(req.url).searchParams.get("keepFiles") === "true";
  const transaction = await db.transaction("write");
  const urls: string[] = [];
  let removedCount = 0;

  try {
    const currentWork = await transaction.execute({
      sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
      args: [workId],
    });
    if (currentWork.rows.length === 0) {
      await transaction.rollback();
      return fail("NOT_FOUND", "Work not found", 404);
    }

    const images = await transaction.execute({
      sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ?",
      args: [workId],
    });
    removedCount = images.rows.length;
    for (const row of images.rows) {
      if (row.image_url) urls.push(row.image_url as string);
      if (row.thumb_url) urls.push(row.thumb_url as string);
    }

    const protectedUrls = new Set(
      [currentWork.rows[0].image_url, currentWork.rows[0].thumb_url]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const urlsToDelete = keepFiles ? [] : urls.filter((url) => !protectedUrls.has(url));

    await transaction.execute({ sql: "DELETE FROM work_images WHERE work_id = ?", args: [workId] });
    if (urlsToDelete.length > 0) {
      await enqueueR2DeleteInTransaction(transaction, urlsToDelete);
    }
    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    if (!transaction.closed) transaction.close();
  }

  await writeAuditLog(req, "work.images.clear", { workId, removed: removedCount, keepFiles });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  revalidateTag("works", "max");
  revalidateTag(`work:${workId}`, "max");
  return ok({ cleared: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;
  void processR2DeleteJobs().catch(() => {});

  const { id: workId } = await params;
  const body = await req.json();
  const items = Array.isArray(body) ? body : [];

  const valid: PreparedWorkImage[] = [];
  for (const [i, item] of items.entries()) {
    const parsed = addImageSchema.safeParse(item);
    if (!parsed.success) continue;
    valid.push({
      id: createId(),
      imageUrl: parsed.data.imageUrl,
      thumbUrl: parsed.data.thumbUrl,
      mediaType: parsed.data.mediaType,
      imageSize: parsed.data.imageSize,
      sortOrder: parsed.data.sortOrder ?? i,
    });
  }

  const transaction = await db.transaction("write");
  let removedUrls: string[] = [];
  let previousCount = 0;

  try {
    const existing = await transaction.execute({
      sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ?",
      args: [workId],
    });
    const currentWork = await transaction.execute({
      sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
      args: [workId],
    });
    if (currentWork.rows.length === 0) {
      await transaction.rollback();
      return fail("NOT_FOUND", "Work not found", 404);
    }

    previousCount = existing.rows.length;
    removedUrls = collectRemovedImageUrls(
      existing.rows as Array<Record<string, unknown>>,
      valid,
      currentWork.rows[0] as Record<string, unknown>
    );
    if (valid.length === 0) {
      const protectedUrls = new Set(
        [currentWork.rows[0].image_url, currentWork.rows[0].thumb_url]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      );
      removedUrls = removedUrls.filter((url) => !protectedUrls.has(url));
    }
    await replaceWorkImagesInTransaction(transaction, workId, valid);

    if (valid.length > 0) {
      const cover = chooseCoverImage(valid, currentWork.rows[0] as Record<string, unknown>);
      await transaction.execute({
        sql: "UPDATE works SET image_url = ?, thumb_url = ?, updated_at = datetime('now') WHERE id = ?",
        args: [cover.imageUrl, cover.thumbUrl, workId],
      });
    }

    await enqueueR2DeleteInTransaction(transaction, removedUrls);
    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    if (!transaction.closed) transaction.close();
  }

  await writeAuditLog(req, "work.images.replace", {
    workId,
    previousCount,
    nextCount: valid.length,
    removedFiles: removedUrls.length,
  });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  revalidateTag("works", "max");
  revalidateTag(`work:${workId}`, "max");
  return ok({ replaced: true, count: valid.length });
}


