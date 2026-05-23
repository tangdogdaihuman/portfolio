import { NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import db, { ensureMigrated } from "@/lib/db";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";

const sectionSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  sortOrder: z.number().optional(),
});

export async function GET() {
  await ensureMigrated();
  const result = await db.execute(
    "SELECT id, title, content, sort_order, updated_at FROM detail_sections ORDER BY sort_order ASC, created_at ASC"
  );
  return ok(result.rows);
}

export async function POST(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const parsed = sectionSchema.safeParse(body);
  if (!parsed.success) {
    return fail("BAD_REQUEST", "Invalid detail section payload", 400, parsed.error.flatten());
  }

  const id = createId();
  if (typeof parsed.data.sortOrder === "number") {
    await db.execute({
      sql: "INSERT INTO detail_sections (id, title, content, sort_order) VALUES (?, ?, ?, ?)",
      args: [id, parsed.data.title, parsed.data.content, parsed.data.sortOrder],
    });
  } else {
    await db.execute({
      sql: "INSERT INTO detail_sections (id, title, content, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM detail_sections))",
      args: [id, parsed.data.title, parsed.data.content],
    });
  }

  revalidatePath("/");
  revalidateTag("detail-sections", "max");
  return ok({ id }, 201, "Created");
}


