import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";

const introSchema = z.object({
  content: z.string(),
});

export async function GET() {
  const result = await db.execute("SELECT content, updated_at FROM intro WHERE id = 1");
  const row = result.rows[0];
  return ok({
    content: row?.content || "",
    updatedAt: row?.updated_at || "",
  });
}

export async function PUT(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const parsed = introSchema.safeParse(body);
  if (!parsed.success) {
    return fail("BAD_REQUEST", "Invalid intro payload", 400, parsed.error.flatten());
  }

  await db.execute({
    sql: "UPDATE intro SET content = ?, updated_at = datetime('now') WHERE id = 1",
    args: [parsed.data.content],
  });

  revalidatePath("/");
  revalidateTag("intro", "max");
  return ok({ updated: true });
}


