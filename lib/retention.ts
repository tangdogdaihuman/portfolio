import type { InArgs } from "@libsql/client";
import db from "@/lib/db";
import { reportApiError, reportMetric } from "@/lib/monitoring";

export type RetentionCounts = {
  rateLimits: number;
  verificationCodes: number;
  auditLogs: number;
  visits: number;
};

const AUDIT_LOG_RETENTION_DAYS = 180;
const VISIT_RETENTION_DAYS = 400;
const RATE_LIMIT_GRACE_MS = 24 * 60 * 60 * 1000;
const CHUNK_ROWS = 1000;
const MAX_CHUNKS = 20;

async function prune(scope: string, statement: { sql: string; args: InArgs }): Promise<number> {
  let deleted = 0;
  try {
    for (let chunk = 0; chunk < MAX_CHUNKS; chunk += 1) {
      const result = await db.execute(statement);
      const affected = Number(result.rowsAffected) || 0;
      deleted += affected;
      if (affected < CHUNK_ROWS) break;
    }
  } catch (error) {
    reportApiError({
      scope: `retention.${scope}.failed`,
      message: error instanceof Error ? error.message : "unknown",
      meta: { deletedSoFar: deleted },
    });
  }
  if (deleted > 0) reportMetric({ scope: `retention.${scope}.deleted`, value: deleted });
  return deleted;
}

export function pruneRateLimitRows() {
  return prune("rate_limits", {
    sql: `DELETE FROM rate_limits WHERE rowid IN (
            SELECT rowid FROM rate_limits WHERE reset_at < ? ORDER BY reset_at ASC LIMIT ?
          )`,
    args: [Date.now() - RATE_LIMIT_GRACE_MS, CHUNK_ROWS],
  });
}

export function pruneAuditLogs() {
  return prune("audit_logs", {
    sql: `DELETE FROM audit_logs WHERE rowid IN (
            SELECT rowid FROM audit_logs WHERE created_at < datetime('now', ?) ORDER BY created_at ASC LIMIT ?
          )`,
    args: [`-${AUDIT_LOG_RETENTION_DAYS} days`, CHUNK_ROWS],
  });
}

export function pruneVisits() {
  return prune("visits", {
    sql: `DELETE FROM visits WHERE rowid IN (
            SELECT rowid FROM visits WHERE created_at < datetime('now', ?) ORDER BY created_at ASC LIMIT ?
          )`,
    args: [`-${VISIT_RETENTION_DAYS} days`, CHUNK_ROWS],
  });
}

export function pruneVerificationCodeRows() {
  return prune("verification_codes", {
    sql: `DELETE FROM verification_codes WHERE rowid IN (
            SELECT rowid FROM verification_codes WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?
          )`,
    args: [Date.now(), CHUNK_ROWS],
  });
}

export async function pruneRetentionTables(): Promise<RetentionCounts> {
  const rateLimits = await pruneRateLimitRows();
  const verificationCodes = await pruneVerificationCodeRows();
  const auditLogs = await pruneAuditLogs();
  const visits = await pruneVisits();
  return { rateLimits, verificationCodes, auditLogs, visits };
}
