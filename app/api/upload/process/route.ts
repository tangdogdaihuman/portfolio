import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "@/lib/auth";
import { generateThumbnail } from "@/lib/image";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
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
  const chunks: Buffer[] = [];
  if (getResponse.Body) {
    for await (const chunk of getResponse.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
  }
  const originalBuffer = Buffer.concat(chunks);

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
