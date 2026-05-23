import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { generateThumbnail } from "@/lib/image";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const { originalKey } = body;
  if (typeof originalKey !== "string" || !originalKey.startsWith("originals/")) {
    return NextResponse.json({ error: "Invalid originalKey" }, { status: 400 });
  }

  const getResponse = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: originalKey })
  );
  if (!getResponse.Body || !getResponse.ContentLength || getResponse.ContentLength === 0) {
    return NextResponse.json({ error: "Original file is empty or not found" }, { status: 400 });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of getResponse.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  const originalBuffer = Buffer.concat(chunks);
  if (originalBuffer.length === 0) {
    return NextResponse.json({ error: "Original file is empty" }, { status: 400 });
  }

  const thumbnail = await generateThumbnail(originalBuffer);
  const thumbId = createId();
  const thumbKey = `thumbnails/${thumbId}.webp`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: thumbKey,
      Body: thumbnail,
      ContentType: "image/webp",
    })
  );

  return NextResponse.json({
    imageUrl: publicUrl(originalKey),
    thumbUrl: publicUrl(thumbKey),
  });
}
