import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { imageId } = await params;
  const result = await db.execute({
    sql: "SELECT image_url, thumb_url FROM work_images WHERE id = ?",
    args: [imageId],
  });
  const urls: string[] = [];
  if (result.rows.length > 0) {
    if (result.rows[0].image_url) urls.push(result.rows[0].image_url as string);
    if (result.rows[0].thumb_url) urls.push(result.rows[0].thumb_url as string);
  }
  await db.execute({ sql: "DELETE FROM work_images WHERE id = ?", args: [imageId] });
  deleteFromR2(urls).catch(() => {});
  return NextResponse.json({ ok: true });
}
