import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db, { tagsToArray, tagsToString } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { processR2DeleteJobs } from "@/lib/r2-delete-jobs";

const workSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  software: z.array(z.string()).default([]),
  imageUrl: z.string().url(),
  thumbUrl: z.string().url(),
  pinned: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  workDate: z.string().default(""),
  imageSize: z.number().int().default(0),
  sizeWeight: z.number().min(0.5).max(2.0).default(1.0),
});

export async function GET() {
  const result = await db.execute(
    `SELECT w.*, (SELECT COUNT(*) FROM work_images WHERE work_id = w.id) as image_count,
     COALESCE((SELECT SUM(image_size) FROM work_images WHERE work_id = w.id), w.image_size) as total_size
     FROM works w ORDER BY w.pinned DESC, w.sort_order DESC, w.created_at DESC`
  );
  const works = result.rows.map((row) => ({
    ...row,
    tags: tagsToArray(row.tags),
    software: tagsToArray(row.software),
    pinned: Boolean(row.pinned),
    image_count: (row.image_count as number) ?? 0,
  }));
  return ok(works);
}

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;
    await processR2DeleteJobs();

    const body = await req.json();
    const parsed = workSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "Invalid work payload", 400, parsed.error.flatten());
    }

    const { title, description, tags, software, imageUrl, thumbUrl, pinned, sortOrder, workDate, imageSize, sizeWeight } = parsed.data;
    const id = createId();

    await db.execute({
      sql: `INSERT INTO works (id, title, description, tags, software, image_url, thumb_url, pinned, sort_order, work_date, image_size, size_weight)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, title, description, tagsToString(tags), tagsToString(software), imageUrl, thumbUrl, pinned ? 1 : 0, sortOrder, workDate, imageSize, sizeWeight],
    });

    reportMetric({ scope: "audit.work.create", value: 1, path: req.nextUrl.pathname, meta: { id } });
    await writeAuditLog(req, "work.create", { id, title });
    revalidatePath("/");
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


