import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(req: NextRequest) {
  const blockedOrigin = requireSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const contentType = body.contentType as string;
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
  }
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
