import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { enqueueR2Delete, processR2DeleteJobs } from "@/lib/r2-delete-jobs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;
  await processR2DeleteJobs();

  const { imageId } = await params;
  const result = await db.execute({
    sql: "SELECT image_url, thumb_url, work_id FROM work_images WHERE id = ?",
    args: [imageId],
  });
  if (result.rows.length === 0) {
    return fail("NOT_FOUND", "Image not found", 404);
  }
  const row = result.rows[0];
  const urls: string[] = [];
  if (row.image_url) urls.push(row.image_url as string);
  if (row.thumb_url) urls.push(row.thumb_url as string);

  await db.execute({ sql: "DELETE FROM work_images WHERE id = ?", args: [imageId] });

  // If deleted image was the work's cover, pick next available image as cover
  const workId = row.work_id as string;
  const work = await db.execute({
    sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
    args: [workId],
  });
  if (work.rows.length > 0) {
    const w = work.rows[0];
    const deletedUrl = row.image_url || row.thumb_url;
    if (w.image_url === deletedUrl || w.thumb_url === row.thumb_url) {
      const nextImg = await db.execute({
        sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ? ORDER BY sort_order ASC LIMIT 1",
        args: [workId],
      });
      await db.execute({
        sql: "UPDATE works SET image_url = ?, thumb_url = ? WHERE id = ?",
        args: [
          (nextImg.rows[0]?.image_url as string) || "",
          (nextImg.rows[0]?.thumb_url as string) || "",
          workId,
        ],
      });
    }
  }

  await enqueueR2Delete(urls);
  await writeAuditLog(req, "work.image.delete", { imageId, workId });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  revalidateTag("works", "max");
  revalidateTag(`work:${workId}`, "max");
  return ok({ deleted: true });
}


