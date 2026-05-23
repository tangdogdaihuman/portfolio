import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";

const updateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sortOrder: z.number().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("BAD_REQUEST", "Invalid detail section payload", 400, parsed.error.flatten());
  }

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (parsed.data.title !== undefined) { sets.push("title = ?"); args.push(parsed.data.title); }
  if (parsed.data.content !== undefined) { sets.push("content = ?"); args.push(parsed.data.content); }
  if (parsed.data.sortOrder !== undefined) { sets.push("sort_order = ?"); args.push(parsed.data.sortOrder); }
  if (sets.length === 0) return ok({ updated: true });

  sets.push("updated_at = datetime('now')");
  args.push(id);
  await db.execute({ sql: `UPDATE detail_sections SET ${sets.join(", ")} WHERE id = ?`, args });

  revalidatePath("/");
  revalidateTag("detail-sections", "max");
  return ok({ updated: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id } = await params;
  await db.execute({ sql: "DELETE FROM detail_sections WHERE id = ?", args: [id] });
  revalidatePath("/");
  revalidateTag("detail-sections", "max");
  return ok({ deleted: true });
}


