import { createId } from "@paralleldrive/cuid2";
import type { NextRequest } from "next/server";
import db from "@/lib/db";

type AuditMeta = Record<string, unknown>;

function getActor(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return ip;
}

export async function writeAuditLog(
  req: NextRequest,
  scope: string,
  meta: AuditMeta = {}
) {
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
}

