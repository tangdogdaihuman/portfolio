import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const addImageSchema = z.object({
  imageUrl: z.string().url(),
  thumbUrl: z.string().url(),
  imageSize: z.number().int().default(0),
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

  // Fallback: return cover image if no sub-images exist
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
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workId } = await params;
  const body = await req.json();

  // Support single or batch
  const items = Array.isArray(body) ? body : [body];
  const ids: string[] = [];

  for (const item of items) {
    const parsed = addImageSchema.safeParse(item);
    if (!parsed.success) continue;
    const imageId = createId();
    await db.execute({
      sql: `INSERT INTO work_images (id, work_id, image_url, thumb_url, sort_order, image_size)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [imageId, workId, parsed.data.imageUrl, parsed.data.thumbUrl, ids.length, parsed.data.imageSize],
    });
    ids.push(imageId);
  }

  // Update work's cover image if not set
  if (ids.length > 0) {
    const work = await db.execute({
      sql: "SELECT image_url FROM works WHERE id = ?",
      args: [workId],
    });
    if (work.rows.length > 0 && !work.rows[0].image_url) {
      const first = await db.execute({
        sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ? ORDER BY sort_order LIMIT 1",
        args: [workId],
      });
      if (first.rows.length > 0) {
        await db.execute({
          sql: "UPDATE works SET image_url = ?, thumb_url = ? WHERE id = ?",
          args: [first.rows[0].image_url, first.rows[0].thumb_url, workId],
        });
      }
    }
  }

  return NextResponse.json({ ids }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: workId } = await params;
  await db.execute({ sql: "DELETE FROM work_images WHERE work_id = ?", args: [workId] });
  return NextResponse.json({ ok: true });
}
