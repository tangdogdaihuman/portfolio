import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db, { tagsToString } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth, verifyAuthRequest } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { processR2DeleteJobs } from "@/lib/r2-delete-jobs";
import {
  descriptionField,
  fileSizeField,
  sizeWeightField,
  tagListField,
  titleField,
  urlField,
  workDateField,
} from "@/lib/validate/work-fields";
import { replaceWorkImagesInTransaction, type PreparedWorkImage } from "@/lib/work-images-replace";
import { rowToWork } from "@/lib/work-mappers";

const imageSchema = z.object({
  imageUrl: urlField,
  thumbUrl: urlField,
  mediaType: z.enum(["image", "video"]).default("image"),
  imageSize: fileSizeField.default(0),
  sortOrder: z.number().int().optional(),
});

const workSchema = z.object({
  title: titleField,
  description: descriptionField,
  tags: tagListField.default([]),
  software: tagListField.default([]),
  imageUrl: urlField,
  thumbUrl: urlField,
  pinned: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  workDate: workDateField.default(""),
  imageSize: fileSizeField.default(0),
  sizeWeight: sizeWeightField.default(1.0),
  images: z.array(imageSchema).optional(),
});

async function loadWorksList() {
  const result = await db.execute(
    `SELECT w.*, (SELECT COUNT(*) FROM work_images WHERE work_id = w.id) as image_count,
     CASE WHEN (SELECT COALESCE(SUM(image_size), 0) FROM work_images WHERE work_id = w.id) = 0
          THEN w.image_size
          ELSE (SELECT SUM(image_size) FROM work_images WHERE work_id = w.id) END as total_size
     FROM works w ORDER BY w.pinned DESC, w.sort_order DESC, w.created_at DESC`
  );
  return result.rows.map((row) => rowToWork(row as Record<string, unknown>));
}

const getWorksList = unstable_cache(loadWorksList, ["works-list"], {
  revalidate: 300,
  tags: ["works"],
});

export async function GET(req: NextRequest) {
  if (await verifyAuthRequest(req)) {
    return ok(await loadWorksList());
  }
  return ok(await getWorksList());
}

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;
    void processR2DeleteJobs().catch(() => {});

    const body = await req.json();
    const parsed = workSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "Invalid work payload", 400, parsed.error.flatten());
    }

    const { title, description, tags, software, imageUrl, thumbUrl, pinned, sortOrder, workDate, imageSize, sizeWeight } = parsed.data;
    const id = createId();
    const images: PreparedWorkImage[] = (parsed.data.images ?? []).map((image, index) => ({
      id: createId(),
      imageUrl: image.imageUrl,
      thumbUrl: image.thumbUrl,
      mediaType: image.mediaType,
      imageSize: image.imageSize,
      sortOrder: image.sortOrder ?? index,
    }));
    const cover = images.length > 0
      ? images.find((image) => image.imageUrl === imageUrl || image.thumbUrl === thumbUrl) || null
      : null;
    if (images.length > 0 && !cover) {
      return fail("BAD_REQUEST", "Cover image must be included in images", 400);
    }

    const transaction = await db.transaction("write");
    try {
      await transaction.execute({
        sql: `INSERT INTO works (id, title, description, tags, software, image_url, thumb_url, pinned, sort_order, work_date, image_size, size_weight)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          title,
          description,
          tagsToString(tags),
          tagsToString(software),
          cover?.imageUrl ?? imageUrl,
          cover?.thumbUrl ?? thumbUrl,
          pinned ? 1 : 0,
          sortOrder,
          workDate,
          cover?.imageSize ?? imageSize,
          sizeWeight,
        ],
      });
      if (images.length > 0) {
        await replaceWorkImagesInTransaction(transaction, id, images);
      }
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      if (!transaction.closed) transaction.close();
    }

    reportMetric({ scope: "audit.work.create", value: 1, path: req.nextUrl.pathname, meta: { id } });
    await writeAuditLog(req, "work.create", { id, title });
    revalidatePath("/");
    revalidatePath("/sitemap.xml");
    revalidatePath(`/work/${id}`);
    revalidateTag("works", "max");
    revalidateTag(`work:${id}`, "max");
    return ok({ id }, 201, "Created");
  } catch (error) {
    reportApiError({
      scope: "works.create.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "创建作品失败", 500);
  }
}


