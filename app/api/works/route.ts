import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

const workSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().url(),
  thumbUrl: z.string().url(),
  pinned: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  const result = await db.execute(
    "SELECT * FROM works ORDER BY pinned DESC, sort_order DESC, created_at DESC"
  );
  const works = result.rows.map((row) => ({
    ...row,
    tags: row.tags ? (row.tags as string).split(",").filter(Boolean) : [],
    pinned: Boolean(row.pinned),
  }));
  return NextResponse.json(works);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = workSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, description, tags, imageUrl, thumbUrl, pinned, sortOrder } =
    parsed.data;
  const id = createId();
  const tagString = tags.join(",");

  await db.execute({
    sql: `INSERT INTO works (id, title, description, tags, image_url, thumb_url, pinned, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, title, description, tagString, imageUrl, thumbUrl, pinned ? 1 : 0, sortOrder],
  });

  return NextResponse.json({ id }, { status: 201 });
}
