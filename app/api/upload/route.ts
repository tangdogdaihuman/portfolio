import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { verifyAuthRequest } from "@/lib/auth";
import { generateThumbnail } from "@/lib/image";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image files allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1] || "png";
  const id = createId();

  const originalKey = `originals/${id}.${ext}`;
  const thumbKey = `thumbnails/${id}.webp`;

  const thumbnail = await generateThumbnail(buffer);

  await Promise.all([
    r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: originalKey,
        Body: buffer,
        ContentType: file.type,
      })
    ),
    r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: thumbKey,
        Body: thumbnail,
        ContentType: "image/webp",
      })
    ),
  ]);

  return NextResponse.json({
    imageUrl: publicUrl(originalKey),
    thumbUrl: publicUrl(thumbKey),
  });
}
