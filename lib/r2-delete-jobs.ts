import { createId } from "@paralleldrive/cuid2";
import type { InArgs } from "@libsql/client";
import db from "@/lib/db";
import { mediaUrlToKey } from "@/lib/media-url";
import { deleteFromR2 } from "@/lib/r2";
import { reportApiError, reportMetric } from "@/lib/monitoring";

type R2DeleteJobExecutor = {
  execute(statement: { sql: string; args: InArgs }): Promise<unknown>;
};

type R2DeleteJob = {
  id: string;
  attempts: number;
  urls: string[];
};

const URL_CHUNK_SIZE = 100;

function backoffSeconds(attempts: number) {
  return Math.min(300, 2 ** Math.max(1, attempts));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

function originOf(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function ownOrigins(): string[] {
  const configured = [
    process.env.R2_PUBLIC_URL,
    ...(process.env.R2_ALT_PUBLIC_URLS ?? "").split(","),
  ];
  const account = process.env.R2_ACCOUNT_ID;
  if (account) {
    configured.push(`https://${account}.r2.cloudflarestorage.com`);
    configured.push(`https://${account}.r2.dev`);
  }
  const origins = new Set<string>();
  for (const candidate of configured) {
    const origin = originOf(candidate);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

function chunked(items: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function referenceLookup(table: string, placeholders: string): string {
  return `SELECT image_url AS url FROM ${table} WHERE image_url IN (${placeholders})
          UNION ALL
          SELECT thumb_url AS url FROM ${table} WHERE thumb_url IN (${placeholders})`;
}

async function findReferencedUrls(urls: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return referenced;

  const origins = ownOrigins();
  const keysByUrl = new Map<string, string | null>();
  const candidateToUrl = new Map<string, string>();
  for (const url of unique) {
    const key = mediaUrlToKey(url);
    keysByUrl.set(url, key);
    if (!candidateToUrl.has(url)) candidateToUrl.set(url, url);
    if (!key) continue;
    for (const origin of origins) {
      const variant = `${origin}/${key}`;
      if (!candidateToUrl.has(variant)) candidateToUrl.set(variant, url);
    }
  }

  const referencedKeys = new Set<string>();
  for (const chunk of chunked([...candidateToUrl.keys()], URL_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const args = [...chunk, ...chunk];
    const [worksRes, imagesRes] = await Promise.all([
      db.execute({ sql: referenceLookup("works", placeholders), args }),
      db.execute({ sql: referenceLookup("work_images", placeholders), args }),
    ]);

    for (const result of [worksRes, imagesRes]) {
      for (const row of result.rows) {
        const value = row.url;
        if (typeof value !== "string" || !value) continue;
        const source = candidateToUrl.get(value);
        if (source) referenced.add(source);
        const key = mediaUrlToKey(value);
        if (key) referencedKeys.add(key);
      }
    }
  }

  for (const [url, key] of keysByUrl) {
    if (key && referencedKeys.has(key)) referenced.add(url);
  }
  return referenced;
}

function parseJob(row: Record<string, unknown>): R2DeleteJob {
  let urls: string[] = [];
  try {
    const parsed = JSON.parse((row.urls_json as string) || "[]");
    urls = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    urls = [];
  }
  return { id: row.id as string, attempts: Number(row.attempts || 0), urls };
}

export async function enqueueR2Delete(urls: string[]) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return;
  await enqueueR2DeleteInTransaction(db, unique);
}

export async function enqueueR2DeleteInTransaction(executor: R2DeleteJobExecutor, urls: string[]) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return 0;
  await executor.execute({
    sql: "INSERT INTO r2_delete_jobs (id, urls_json, attempts, next_run_at) VALUES (?, ?, 0, datetime('now'))",
    args: [createId(), JSON.stringify(unique)],
  });
  reportMetric({ scope: "r2.delete.enqueue", value: unique.length, meta: { jobCount: 1 } });
  return unique.length;
}

export async function processR2DeleteJobs(limit = 5) {
  const summary = { processed: 0, succeeded: 0, failed: 0 };
  const jobs = await db.execute({
    sql: `SELECT id, urls_json, attempts
          FROM r2_delete_jobs
          WHERE next_run_at <= datetime('now')
          ORDER BY next_run_at ASC
          LIMIT ?`,
    args: [limit],
  });

  const pendingJobs = jobs.rows.map((row) => parseJob(row));
  if (pendingJobs.length === 0) return summary;

  const allUrls = [...new Set(pendingJobs.flatMap((job) => job.urls))];
  let referenced: Set<string>;
  try {
    referenced = await findReferencedUrls(allUrls);
  } catch (error) {
    reportApiError({
      scope: "r2.delete.reference_check_failed",
      message: errorMessage(error),
      meta: { jobCount: pendingJobs.length, urlCount: allUrls.length },
    });
    return summary;
  }

  for (const job of pendingJobs) {
    summary.processed += 1;
    const { id, attempts, urls } = job;
    const deletable = urls.filter((url) => !referenced.has(url));

    try {
      const skipped = urls.length - deletable.length;
      if (skipped > 0) {
        reportMetric({ scope: "r2.delete.skip_referenced", value: skipped, meta: { jobId: id, attempts } });
      }
      if (deletable.length > 0) {
        await deleteFromR2(deletable);
      }
      await db.execute({ sql: "DELETE FROM r2_delete_jobs WHERE id = ?", args: [id] });
      summary.succeeded += 1;
      reportMetric({ scope: "r2.delete.succeeded", value: deletable.length, meta: { jobId: id, attempts } });
    } catch (error) {
      summary.failed += 1;
      const nextAttempts = attempts + 1;
      const waitSeconds = backoffSeconds(nextAttempts);
      const errMsg = errorMessage(error);
      await db.execute({
        sql: `UPDATE r2_delete_jobs
              SET attempts = ?, last_error = ?, next_run_at = datetime('now', ?)
              WHERE id = ?`,
        args: [nextAttempts, errMsg, `+${waitSeconds} seconds`, id],
      });
      reportMetric({ scope: "r2.delete.failed", value: urls.length || 1, meta: { jobId: id, attempts: nextAttempts } });
      reportApiError({
        scope: "r2.delete.failed",
        message: errMsg,
        meta: { jobId: id, attempts: nextAttempts, urlCount: urls.length, nextRunInSeconds: waitSeconds },
      });
    }
  }
  return summary;
}
