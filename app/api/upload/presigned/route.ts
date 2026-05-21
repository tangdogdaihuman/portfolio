import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { verifyAuthRequest } from "@/lib/auth";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  if (!(await verifyAuthRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contentType = "image/png" } = body;
  const ext = contentType.split("/")[1] || "png";
  const id = createId();
  const originalKey = `originals/${id}.${ext}`;

  const signedUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: originalKey,
      ContentType: contentType,
    }),
    { expiresIn: 300 }
  );

  return NextResponse.json({
    uploadUrl: signedUrl,
    originalKey,
    imageUrl: publicUrl(originalKey),
  });
}
