export interface UploadedFile {
  imageUrl: string;
  thumbUrl: string;
  size: number;
  fileName: string;
}

export async function uploadImageToR2(file: File): Promise<UploadedFile> {
  const presignedRes = await fetch("/api/upload/presigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  if (!presignedRes.ok) throw new Error("presigned");
  const { uploadUrl, originalKey } = await presignedRes.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!uploadRes.ok) throw new Error("upload");

  const processRes = await fetch("/api/upload/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalKey }),
  });
  if (!processRes.ok) throw new Error("process");
  const data = await processRes.json();

  return {
    imageUrl: data.imageUrl,
    thumbUrl: data.thumbUrl,
    size: file.size,
    fileName: file.name.replace(/\.[^.]+$/, ""),
  };
}
