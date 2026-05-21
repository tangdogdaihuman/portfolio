import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { verifyAuthRequest } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageId } = await params;
  await db.execute({ sql: "DELETE FROM work_images WHERE id = ?", args: [imageId] });
  return NextResponse.json({ ok: true });
}
