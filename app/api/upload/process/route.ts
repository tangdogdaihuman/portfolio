import { NextRequest } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { generateThumbnail } from "@/lib/image";
import { r2, R2_BUCKET, publicUrl } from "@/lib/r2";
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/media-url";
import { reportApiError, reportMetric } from "@/lib/monitoring";
import { getIdempotencyStore } from "@/lib/idempotency-store";
import { fail, ok } from "@/lib/api-response";
import { formatBytes, MAX_IMAGE_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/upload-policy";

const VIDEO_KEY_PATTERN = /^originals\/.+\.(mp4|webm|mov|avi|mkv)$/i;

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const unauth = await requireAuth(req);
    if (unauth) return unauth;

    const body = await req.json();
    const { originalKey } = body;
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const cacheKey = requestId ? `upload:process:${requestId}` : "";
    const cached = cacheKey
      ? getIdempotencyStore().get<{ imageUrl: string; thumbUrl: string }>(cacheKey)
      : null;
    if (cached) {
      return ok(cached);
    }
    if (typeof originalKey !== "string" || !originalKey.startsWith("originals/")) {
      reportMetric({ scope: "upload.process.invalid_key", value: 1, path: req.nextUrl.pathname });
      return fail("BAD_REQUEST", "Invalid originalKey", 400);
    }

    if (VIDEO_KEY_PATTERN.test(originalKey)) {
      const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: originalKey }));
      const size = Number(head.ContentLength ?? 0);
      if (size <= 0 || size > MAX_VIDEO_UPLOAD_BYTES) {
        reportMetric({ scope: "upload.process.video_too_large", value: 1, path: req.nextUrl.pathname, meta: { originalKey, size } });
        return fail("PAYLOAD_TOO_LARGE", `视频过大，限制为 ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}`, 413);
      }
      const videoPayload = { imageUrl: publicUrl(originalKey), thumbUrl: publicUrl(originalKey) };
      if (cacheKey) {
        getIdempotencyStore().set(cacheKey, videoPayload, 10 * 60 * 1000);
      }
      return ok(videoPayload);
    }

    const getResponse = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: originalKey })
    );
    if (!getResponse.Body) {
      reportMetric({ scope: "upload.process.empty_original", value: 1, path: req.nextUrl.pathname, meta: { originalKey } });
      return fail("BAD_REQUEST", "Original file is empty or not found", 400);
    }
    if (getResponse.ContentLength && getResponse.ContentLength > MAX_IMAGE_UPLOAD_BYTES) {
      reportMetric({ scope: "upload.process.too_large", value: 1, path: req.nextUrl.pathname, meta: { originalKey, size: getResponse.ContentLength } });
      return fail("PAYLOAD_TOO_LARGE", `图片过大，限制为 ${formatBytes(MAX_IMAGE_UPLOAD_BYTES)}`, 413);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of getResponse.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const originalBuffer = Buffer.concat(chunks);
    if (originalBuffer.length === 0) {
      reportMetric({ scope: "upload.process.empty_buffer", value: 1, path: req.nextUrl.pathname, meta: { originalKey } });
      return fail("BAD_REQUEST", "Original file is empty", 400);
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
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      })
    );

    const payload = {
      imageUrl: publicUrl(originalKey),
      thumbUrl: publicUrl(thumbKey),
    };
    if (cacheKey) {
      getIdempotencyStore().set(cacheKey, payload, 10 * 60 * 1000);
    }
    return ok(payload);
  } catch (error) {
    reportApiError({
      scope: "upload.process.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "处理图片失败", 500);
  }
}

