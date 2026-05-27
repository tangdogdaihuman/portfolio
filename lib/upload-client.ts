export interface UploadedFile {
  imageUrl: string;
  thumbUrl: string;
  size: number;
  // Kept for compatibility: filename without extension.
  fileName: string;
  originalFileName: string;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.message === "string") return data.message;
    return typeof data.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export async function cleanupUploadedFiles(files: Pick<UploadedFile, "imageUrl" | "thumbUrl">[]) {
  const urls = files.flatMap((file) => [file.imageUrl, file.thumbUrl]).filter(Boolean);
  if (urls.length === 0) return;

  await fetch("/api/upload/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
}

export async function uploadImageToR2(file: File): Promise<UploadedFile> {
  const requestId = createRequestId();
  const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name) || file.type.startsWith("video/");

  const presignedRes = await fetch("/api/upload/presigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, requestId }),
  });
  if (!presignedRes.ok) throw new Error(await readError(presignedRes, "获取上传地址失败"));
  const { uploadUrl, originalKey, imageUrl } = await presignedRes.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!uploadRes.ok) throw new Error("上传原图失败");

  if (isVideo) {
    return {
      imageUrl,
      thumbUrl: imageUrl,
      size: file.size,
      fileName: file.name.replace(/\.[^.]+$/, ""),
      originalFileName: file.name,
    };
  }

  const processRes = await fetch("/api/upload/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalKey, requestId }),
  });
  if (!processRes.ok) {
    await cleanupUploadedFiles([{ imageUrl, thumbUrl: "" }]);
    throw new Error(await readError(processRes, "生成缩略图失败"));
  }
  const data = await processRes.json();

  return {
    imageUrl: data.imageUrl,
    thumbUrl: data.thumbUrl,
    size: file.size,
    fileName: file.name.replace(/\.[^.]+$/, ""),
    originalFileName: file.name,
  };
}
