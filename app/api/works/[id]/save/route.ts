import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db, { TOUCH_WORK_UPDATED_AT_SQL, tagsToString } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { enqueueR2DeleteInTransaction, processR2DeleteJobs } from "@/lib/r2-delete-jobs";
import {
  descriptionField,
  fileSizeField,
  sizeWeightField,
  tagListField,
  titleField,
  urlField,
  workDateField,
} from "@/lib/validate/work-fields";
import {
  collectRemovedImageUrls,
  replaceWorkImagesInTransaction,
  type PreparedWorkImage,
} from "@/lib/work-images-replace";

const imageSchema = z.object({
  imageUrl: urlField,
  thumbUrl: urlField,
  mediaType: z.enum(["image", "video"]).default("image"),
  imageSize: fileSizeField.default(0),
  sortOrder: z.number().int().optional(),
});

const saveSchema = z.object({
  title: titleField,
  description: descriptionField,
  tags: tagListField.default([]),
  software: tagListField.default([]),
  imageUrl: urlField,
  thumbUrl: urlField,
  imageSize: fileSizeField.default(0),
  workDate: workDateField.default(""),
  sizeWeight: sizeWeightField.default(1.0),
  expectedUpdatedAt: z.string().min(1).optional(),
  images: z.array(imageSchema).min(1),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;
    void processR2DeleteJobs().catch(() => {});

    const { id: workId } = await params;
    const body = await req.json();
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "Invalid save payload", 400, parsed.error.flatten());
    }

    const data = parsed.data;
    const images: PreparedWorkImage[] = data.images.map((image, index) => ({
      id: createId(),
      imageUrl: image.imageUrl,
      thumbUrl: image.thumbUrl,
      mediaType: image.mediaType,
      imageSize: image.imageSize,
      sortOrder: image.sortOrder ?? index,
    }));
    const cover = images.find((image) => image.imageUrl === data.imageUrl || image.thumbUrl === data.thumbUrl);
    if (!cover) {
      return fail("BAD_REQUEST", "Cover image must be included in images", 400);
    }

    const transaction = await db.transaction("write");
    let removedUrls: string[] = [];
    let previousCount = 0;
    let updatedAt = "";

    try {
      const current = await transaction.execute({
        sql: "SELECT updated_at, image_url, thumb_url FROM works WHERE id = ?",
        args: [workId],
      });
      if (current.rows.length === 0) {
        await transaction.rollback();
        return fail("NOT_FOUND", "Work not found", 404);
      }
      if (data.expectedUpdatedAt && current.rows[0].updated_at !== data.expectedUpdatedAt) {
        await transaction.rollback();
        return fail("CONFLICT", "Conflict: work updated by another session", 409);
      }

      const existing = await transaction.execute({
        sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ?",
        args: [workId],
      });
      previousCount = existing.rows.length;
      removedUrls = collectRemovedImageUrls(
        existing.rows as Array<Record<string, unknown>>,
        images,
        current.rows[0] as Record<string, unknown>
      );

      await transaction.execute({
        sql: `UPDATE works
              SET title = ?, description = ?, tags = ?, software = ?, image_url = ?, thumb_url = ?,
                  work_date = ?, image_size = ?, size_weight = ?, ${TOUCH_WORK_UPDATED_AT_SQL}
              WHERE id = ?`,
        args: [
          data.title,
          data.description,
          tagsToString(data.tags),
          tagsToString(data.software),
          cover.imageUrl,
          cover.thumbUrl,
          data.workDate,
          cover.imageSize || data.imageSize,
          data.sizeWeight,
          workId,
        ],
      });
      await replaceWorkImagesInTransaction(transaction, workId, images);

      const updated = await transaction.execute({
        sql: "SELECT updated_at FROM works WHERE id = ?",
        args: [workId],
      });
      updatedAt = (updated.rows[0]?.updated_at as string) || "";

      await enqueueR2DeleteInTransaction(transaction, removedUrls);
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      if (!transaction.closed) transaction.close();
    }

    reportMetric({ scope: "audit.work.save", value: 1, path: req.nextUrl.pathname, meta: { id: workId } });
    await writeAuditLog(req, "work.save", {
      id: workId,
      previousImageCount: previousCount,
      nextImageCount: images.length,
      removedFiles: removedUrls.length,
    });
    revalidatePath("/");
    revalidatePath("/sitemap.xml");
    revalidatePath(`/work/${workId}`);
    revalidateTag("works", "max");
    revalidateTag(`work:${workId}`, "max");
    return ok({ updated: true, updatedAt, count: images.length });
  } catch (error) {
    reportApiError({
      scope: "works.save.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "保存作品失败", 500);
  }
}
