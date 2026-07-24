import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { reportMetric } from "@/lib/monitoring";

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

export function urlToKey(url: string): string | null {
  if (!url || !R2_PUBLIC_URL) return null;
  const prefixes = [
    R2_PUBLIC_URL,
    ...(process.env.R2_ALT_PUBLIC_URLS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
  ];
  for (const p of prefixes) {
    const prefix = p.endsWith("/") ? p : p + "/";
    if (url.startsWith(prefix)) return url.slice(prefix.length);
  }
  return null;
}

export async function deleteFromR2(urls: string[]): Promise<void> {
  const deduped = [...new Set(urls.filter(Boolean))];
  const keys: string[] = [];
  let skipped = 0;
  for (const url of deduped) {
    const key = urlToKey(url);
    if (key) {
      keys.push(key);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    reportMetric({ scope: "r2.delete.skipped", value: skipped });
  }
  if (keys.length === 0) return;

  await deleteR2Keys(r2, R2_BUCKET, keys);
}

export async function deleteR2Keys(
  client: { send(command: unknown): Promise<unknown> },
  bucket: string,
  keys: string[]
): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      })
    );
    const errors = (result as { Errors?: Array<{ Key?: string; Code?: string; Message?: string }> }).Errors || [];
    if (errors.length > 0) {
      const shown = errors.slice(0, 3).map((error) => `${error.Key || "unknown"}:${error.Code || error.Message || "failed"}`).join(", ");
      throw new Error(`R2 delete failed: ${shown}`);
    }
  }
}
