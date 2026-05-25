import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export function publicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

function urlToKey(url: string): string | null {
  if (!url) return null;
  const prefix = R2_PUBLIC_URL.endsWith("/") ? R2_PUBLIC_URL : R2_PUBLIC_URL + "/";
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

export async function deleteFromR2(urls: string[]): Promise<void> {
  const keys = urls.map(urlToKey).filter((k): k is string => !!k);
  if (keys.length === 0) return;

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        })
      );
    } catch (e) {
      console.error("R2 delete failed:", e);
    }
  }
}
