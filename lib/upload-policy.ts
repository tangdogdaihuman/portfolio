export const MAX_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;
export const UPLOAD_LIMIT_HINT = "图片 ≤ 50MB，视频 ≤ 500MB";

const VIDEO_URL_PATTERN = /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_URL_PATTERN.test(url);
}

export function getUploadLimitForType(contentType: string): number | null {
  if (contentType.startsWith("image/")) return MAX_IMAGE_UPLOAD_BYTES;
  if (contentType.startsWith("video/")) return MAX_VIDEO_UPLOAD_BYTES;
  return null;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)}MB`;
}
