import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import db from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";

const introSchema = z.object({
  content: z.string(),
  tagline: z.string().default(""),
});

export async function GET() {
  const result = await db.execute("SELECT content, tagline, updated_at FROM intro WHERE id = 1");
  const row = result.rows[0];
  return ok({
    content: row?.content || "",
    tagline: row?.tagline || "",
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
    sql: `INSERT INTO intro (id, content, tagline, updated_at)
          VALUES (1, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET content = excluded.content,
            tagline = excluded.tagline, updated_at = excluded.updated_at`,
    args: [parsed.data.content, parsed.data.tagline],
  });

  revalidatePath("/");
  revalidateTag("intro", "max");
  return ok({ updated: true });
}


