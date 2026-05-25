import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import db, { tagsToArray, tagsToString } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { enqueueR2Delete, processR2DeleteJobs } from "@/lib/r2-delete-jobs";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  software: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  thumbUrl: z.string().url().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  workDate: z.string().optional(),
  sizeWeight: z.number().min(0.5).max(2.0).optional(),
  expectedUpdatedAt: z.string().optional(),
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
    return fail("NOT_FOUND", "Work not found", 404);
  }

  const row = result.rows[0];
  const work = {
    ...row,
    tags: tagsToArray(row.tags),
    software: tagsToArray(row.software),
    pinned: Boolean(row.pinned),
  };
  return ok(work);
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
    await processR2DeleteJobs();

    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "Invalid update payload", 400, parsed.error.flatten());
    }

    const updates: string[] = [];
    const args: (string | number)[] = [];
    const expectedUpdatedAt = parsed.data.expectedUpdatedAt;

    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (key === "expectedUpdatedAt") continue;
      if (key === "tags" || key === "software") {
        updates.push(`${key} = ?`);
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
      return fail("BAD_REQUEST", "No fields to update", 400);
    }

    updates.push("updated_at = datetime('now')");
    args.push(id);
    if (expectedUpdatedAt) {
      args.push(expectedUpdatedAt);
    }

    const result = await db.execute({
      sql: `UPDATE works SET ${updates.join(", ")} WHERE id = ?${expectedUpdatedAt ? " AND updated_at = ?" : ""}`,
      args,
    });

    if (result.rowsAffected === 0) {
      const exists = await db.execute({
        sql: "SELECT id FROM works WHERE id = ?",
        args: [id],
      });
      if (exists.rows.length === 0) {
        return fail("NOT_FOUND", "Work not found", 404);
      }
      if (expectedUpdatedAt) {
        return fail("CONFLICT", "Conflict: work updated by another session", 409);
      }
      return fail("BAD_REQUEST", "Not updated", 400);
    }

    reportMetric({ scope: "audit.work.update", value: 1, path: req.nextUrl.pathname, meta: { id } });
    await writeAuditLog(req, "work.update", { id, fields: Object.keys(parsed.data).filter((k) => k !== "expectedUpdatedAt") });
    revalidatePath("/");
    revalidatePath(`/work/${id}`);
    revalidateTag("works", "max");
    revalidateTag(`work:${id}`, "max");
    return ok({ updated: true });
  } catch (error) {
    reportApiError({
      scope: "works.update.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "更新作品失败", 500);
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

    await enqueueR2Delete(urls);

    reportMetric({ scope: "audit.work.delete", value: 1, path: req.nextUrl.pathname, meta: { id } });
    await writeAuditLog(req, "work.delete", { id, fileCount: urls.length });
    revalidatePath("/");
    revalidatePath(`/work/${id}`);
    revalidateTag("works", "max");
    revalidateTag(`work:${id}`, "max");
    return ok({ deleted: true });
  } catch (error) {
    reportApiError({
      scope: "works.delete.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "删除作品失败", 500);
  }
}


