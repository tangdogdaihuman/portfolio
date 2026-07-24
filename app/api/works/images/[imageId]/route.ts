import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";
import { enqueueR2DeleteInTransaction, processR2DeleteJobs } from "@/lib/r2-delete-jobs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;
  void processR2DeleteJobs().catch(() => {});

  const { imageId } = await params;
  const urls: string[] = [];
  let workId = "";

  const transaction = await db.transaction("write");
  try {
    const result = await transaction.execute({
      sql: "SELECT image_url, thumb_url, work_id FROM work_images WHERE id = ?",
      args: [imageId],
    });
    if (result.rows.length === 0) {
      await transaction.rollback();
      return fail("NOT_FOUND", "Image not found", 404);
    }
    const row = result.rows[0];
    workId = row.work_id as string;
    if (row.image_url) urls.push(row.image_url as string);
    if (row.thumb_url) urls.push(row.thumb_url as string);

    await transaction.execute({ sql: "DELETE FROM work_images WHERE id = ?", args: [imageId] });

    const work = await transaction.execute({
      sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
      args: [workId],
    });
    if (work.rows.length > 0) {
      const w = work.rows[0];
      const isCover =
        (typeof w.image_url === "string" && w.image_url === row.image_url) ||
        (typeof w.thumb_url === "string" && w.thumb_url === row.thumb_url);
      if (isCover) {
        const nextImg = await transaction.execute({
          sql: "SELECT image_url, thumb_url FROM work_images WHERE work_id = ? ORDER BY sort_order ASC LIMIT 1",
          args: [workId],
        });
        await transaction.execute({
          sql: "UPDATE works SET image_url = ?, thumb_url = ?, updated_at = datetime('now') WHERE id = ?",
          args: [
            (nextImg.rows[0]?.image_url as string) || "",
            (nextImg.rows[0]?.thumb_url as string) || "",
            workId,
          ],
        });
      }
    }

    // Re-read current work for cover URL protection
    const currentWork = await transaction.execute({
      sql: "SELECT image_url, thumb_url FROM works WHERE id = ?",
      args: [workId],
    });
    const protectedUrls = new Set(
      [currentWork.rows[0]?.image_url, currentWork.rows[0]?.thumb_url]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    );
    const safeUrls = urls.filter((url) => !protectedUrls.has(url));
    await enqueueR2DeleteInTransaction(transaction, safeUrls);
    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    if (!transaction.closed) transaction.close();
  }
  await writeAuditLog(req, "work.image.delete", { imageId, workId });
  revalidatePath("/");
  revalidatePath(`/work/${workId}`);
  revalidateTag("works", "max");
  revalidateTag(`work:${workId}`, "max");
  return ok({ deleted: true });
}


