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
import { formatBytes, getUploadLimitForType } from "@/lib/upload-policy";

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
    const fileSize = Number(body.fileSize);
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    if (!ALLOWED.has(contentType)) {
      reportMetric({ scope: "upload.presigned.invalid_type", value: 1, path: req.nextUrl.pathname, meta: { contentType } });
      return fail("BAD_REQUEST", "Invalid file type", 400);
    }
    const limit = getUploadLimitForType(contentType);
    if (!Number.isFinite(fileSize) || fileSize <= 0 || !limit) {
      return fail("BAD_REQUEST", "Invalid file size", 400);
    }
    if (fileSize > limit) {
      reportMetric({ scope: "upload.presigned.too_large", value: 1, path: req.nextUrl.pathname, meta: { contentType, fileSize, limit } });
      return fail("PAYLOAD_TOO_LARGE", `文件过大，当前类型限制为 ${formatBytes(limit)}`, 413);
    }
    const cacheKey = requestId ? `upload:presigned:${requestId}` : "";
    const cached = cacheKey
      ? getIdempotencyStore().get<{ uploadUrl: string; originalKey: string; imageUrl: string; contentType: string }>(cacheKey)
      : null;
    if (cached) {
      if (cached.contentType !== contentType) {
        return fail("BAD_REQUEST", "Request ID reused with different content type", 400);
      }
      return ok({ uploadUrl: cached.uploadUrl, originalKey: cached.originalKey, imageUrl: cached.imageUrl });
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
      contentType,
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

