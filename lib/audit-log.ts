import { createId } from "@paralleldrive/cuid2";
import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";
import { reportApiError } from "@/lib/monitoring";

type AuditMeta = Record<string, unknown>;

function getActor(req: NextRequest): string {
  return getClientIp(req);
}

export async function writeAuditLog(
  req: NextRequest,
  scope: string,
  meta: AuditMeta = {}
) {
  try {
    await db.execute({
      sql: `INSERT INTO audit_logs (id, scope, actor, path, method, meta)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        createId(),
        scope,
        getActor(req),
        req.nextUrl.pathname,
        req.method,
        JSON.stringify(meta),
      ],
    });
  } catch (error) {
    reportApiError({
      scope: "audit.write_failed",
      message: error instanceof Error ? error.message : "unknown",
      path: req.nextUrl.pathname,
    });
  }
}

