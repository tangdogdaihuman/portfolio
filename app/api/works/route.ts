import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db, { tagsToArray, tagsToString } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";

const workSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
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
    pinned: Boolean(row.pinned),
    image_count: (row.image_count as number) ?? 0,
  }));
  return NextResponse.json(works);
}

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;

    const body = await req.json();
    const parsed = workSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { title, description, tags, imageUrl, thumbUrl, pinned, sortOrder, workDate, imageSize, sizeWeight } = parsed.data;
    const id = createId();

    await db.execute({
      sql: `INSERT INTO works (id, title, description, tags, image_url, thumb_url, pinned, sort_order, work_date, image_size, size_weight)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, title, description, tagsToString(tags), imageUrl, thumbUrl, pinned ? 1 : 0, sortOrder, workDate, imageSize, sizeWeight],
    });

    reportMetric({ scope: "audit.work.create", value: 1, path: req.nextUrl.pathname, meta: { id } });
    await writeAuditLog(req, "work.create", { id, title });
    revalidatePath("/");
    revalidatePath(`/work/${id}`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    reportApiError({
      scope: "works.create.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "创建作品失败" }, { status: 500 });
  }
}
