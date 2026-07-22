import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit-log";
import { fail, ok } from "@/lib/api-response";

const itemSchema = z.object({
  id: z.string().min(1),
  sortOrder: z.number().int(),
  expectedUpdatedAt: z.string().optional(),
});

const reorderSchema = z.object({
  items: z.array(itemSchema).min(1),
});

export async function PUT(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;

    const body = await req.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "Invalid reorder payload", 400, parsed.error.flatten());
    }

    const transaction = await db.transaction("write");
    const updated: Array<{ id: string; updatedAt: string }> = [];

    try {
      for (const item of parsed.data.items) {
        if (item.expectedUpdatedAt) {
          const current = await transaction.execute({
            sql: "SELECT updated_at FROM works WHERE id = ?",
            args: [item.id],
          });
          if (current.rows.length === 0) {
            await transaction.rollback();
            return fail("NOT_FOUND", "Work not found", 404);
          }
          if ((current.rows[0].updated_at as string) !== item.expectedUpdatedAt) {
            await transaction.rollback();
            return fail("CONFLICT", "Conflict: work updated by another session", 409);
          }
        }

        const result = await transaction.execute({
          sql: "UPDATE works SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
          args: [item.sortOrder, item.id],
        });
        if (result.rowsAffected === 0) {
          await transaction.rollback();
          return fail("NOT_FOUND", "Work not found", 404);
        }

        const refreshed = await transaction.execute({
          sql: "SELECT updated_at FROM works WHERE id = ?",
          args: [item.id],
        });
        updated.push({
          id: item.id,
          updatedAt: (refreshed.rows[0]?.updated_at as string) || "",
        });
      }

      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      if (!transaction.closed) transaction.close();
    }

    reportMetric({ scope: "audit.work.reorder", value: parsed.data.items.length, path: req.nextUrl.pathname });
    await writeAuditLog(req, "work.reorder", { items: parsed.data.items.map((item) => ({ id: item.id, sortOrder: item.sortOrder })) });
    revalidatePath("/");
    revalidateTag("works", "max");
    return ok({ updated });
  } catch (error) {
    reportApiError({
      scope: "works.reorder.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "排序失败", 500);
  }
}
