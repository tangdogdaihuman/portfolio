import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";

const itemSchema = z.object({
  id: z.string().min(1),
  sortOrder: z.number().int(),
});

const reorderSchema = z.object({
  items: z.array(itemSchema).min(1),
});

export async function PUT(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return fail("BAD_REQUEST", "Invalid detail section reorder payload", 400, parsed.error.flatten());
  }

  const transaction = await db.transaction("write");
  try {
    for (const item of parsed.data.items) {
      const result = await transaction.execute({
        sql: "UPDATE detail_sections SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
        args: [item.sortOrder, item.id],
      });
      if (result.rowsAffected === 0) {
        await transaction.rollback();
        return fail("NOT_FOUND", "Detail section not found", 404);
      }
    }

    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    if (!transaction.closed) transaction.close();
  }

  revalidatePath("/");
  revalidateTag("detail-sections", "max");
  return ok({ updated: true });
}
