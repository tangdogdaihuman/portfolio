import { NextRequest } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { getIdempotencyStore } from "@/lib/idempotency-store";
import { fail, ok } from "@/lib/api-response";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]);

const EXT_MAP: Record<string, string> = {
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;

    const body = await req.json();
    const contentType = body.contentType as string;
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const cacheKey = requestId ? `upload:presigned:${requestId}` : "";
    const cached = cacheKey
      ? getIdempotencyStore().get<{ uploadUrl: string; originalKey: string; imageUrl: string }>(cacheKey)
      : null;
    if (cached) {
      return ok(cached);
    }
    if (!ALLOWED.has(contentType)) {
      reportMetric({ scope: "upload.presigned.invalid_type", value: 1, path: req.nextUrl.pathname, meta: { contentType } });
      return fail("BAD_REQUEST", "Invalid image type", 400);
    }
    const ext = EXT_MAP[contentType] || "png";
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

    const payload = {
      uploadUrl: signedUrl,
      originalKey,
      imageUrl: publicUrl(originalKey),
    };
    if (cacheKey) {
      getIdempotencyStore().set(cacheKey, payload, 10 * 60 * 1000);
    }
    return ok(payload);
  } catch (error) {
    reportApiError({
      scope: "upload.presigned.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "创建上传链接失败", 500);
  }
}

