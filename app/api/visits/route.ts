import { NextRequest } from "next/server";
import crypto from "crypto";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import db from "@/lib/db";
import { rateLimit, requireSameOrigin } from "@/lib/api-security";
import { requireAuth } from "@/lib/auth";
import { reportApiError } from "@/lib/monitoring";
import { fail, ok } from "@/lib/api-response";
import type { VisitStats } from "@/lib/types";

const BOT_PATTERN = /bot|crawl|spider|slurp|headless|preview|lighthouse|pingdom/i;

const trackSchema = z.object({
  path: z.string().min(1).max(200),
  referrer: z.string().max(500).default(""),
});

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.ADMIN_SECRET_KEY || "visit-ip-salt";
  return crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const blockedOrigin = requireSameOrigin(req);
    if (blockedOrigin) return blockedOrigin;

    const limited = await rateLimit(req, "visits.track", 30, 60_000);
    if (limited) return limited;

    const body = await req.json();
    const parsed = trackSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "Invalid visit payload", 400);
    }

    const { path, referrer } = parsed.data;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api") || path.startsWith("/admin")) {
      return fail("BAD_REQUEST", "Invalid path", 400);
    }

    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300);
    if (!userAgent || BOT_PATTERN.test(userAgent)) {
      return ok({ tracked: false });
    }

    await db.execute({
      sql: "INSERT INTO visits (id, path, referrer, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?)",
      args: [createId(), path, referrer.slice(0, 500), userAgent, hashIp(clientIp(req))],
    });

    return ok({ tracked: true }, 201);
  } catch (error) {
    reportApiError({
      scope: "visits.track.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "记录访问失败", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const unauth = await requireAuth(req);
    if (unauth) return unauth;

    const [totalRes, uniqueRes, todayRes, weekRes, dailyRes, topRes, recentRes] = await Promise.all([
      db.execute("SELECT COUNT(*) AS c FROM visits"),
      db.execute("SELECT COUNT(DISTINCT ip_hash) AS c FROM visits"),
      db.execute(`SELECT COUNT(*) AS c, COUNT(DISTINCT ip_hash) AS u FROM visits
                  WHERE date(created_at, '+8 hours') = date('now', '+8 hours')`),
      db.execute("SELECT COUNT(*) AS c FROM visits WHERE created_at >= datetime('now', '-7 days')"),
      db.execute(`SELECT date(created_at, '+8 hours') AS d, COUNT(*) AS c, COUNT(DISTINCT ip_hash) AS u
                  FROM visits WHERE created_at >= datetime('now', '-14 days')
                  GROUP BY d ORDER BY d ASC`),
      db.execute(`SELECT path, COUNT(*) AS c FROM visits
                  GROUP BY path ORDER BY c DESC, path ASC LIMIT 8`),
      db.execute(`SELECT id, path, referrer, user_agent, created_at FROM visits
                  ORDER BY created_at DESC, rowid DESC LIMIT 30`),
    ]);

    const topRows = topRes.rows.map((row) => ({
      path: row.path as string,
      visits: Number(row.c) || 0,
    }));

    const workIds = topRows
      .map((row) => /^\/work\/([^/?#]+)$/.exec(row.path)?.[1])
      .filter((id): id is string => !!id);
    const titles = new Map<string, string>();
    if (workIds.length > 0) {
      const placeholders = workIds.map(() => "?").join(", ");
      const worksRes = await db.execute({
        sql: `SELECT id, title FROM works WHERE id IN (${placeholders})`,
        args: workIds,
      });
      for (const row of worksRes.rows) {
        titles.set(row.id as string, row.title as string);
      }
    }

    const stats: VisitStats = {
      totalVisits: Number(totalRes.rows[0]?.c) || 0,
      uniqueVisitors: Number(uniqueRes.rows[0]?.c) || 0,
      todayVisits: Number(todayRes.rows[0]?.c) || 0,
      todayVisitors: Number(todayRes.rows[0]?.u) || 0,
      weekVisits: Number(weekRes.rows[0]?.c) || 0,
      daily: dailyRes.rows.map((row) => ({
        date: row.d as string,
        visits: Number(row.c) || 0,
        visitors: Number(row.u) || 0,
      })),
      topPages: topRows.map((row) => {
        const workId = /^\/work\/([^/?#]+)$/.exec(row.path)?.[1];
        return {
          path: row.path,
          title: (workId && titles.get(workId)) || (row.path === "/" ? "首页" : row.path),
          visits: row.visits,
        };
      }),
      recent: recentRes.rows.map((row) => ({
        id: row.id as string,
        path: row.path as string,
        referrer: row.referrer as string,
        userAgent: row.user_agent as string,
        createdAt: row.created_at as string,
      })),
    };

    return ok(stats);
  } catch (error) {
    reportApiError({
      scope: "visits.stats.exception",
      message: error instanceof Error ? error.message : "Unknown error",
      path: req.nextUrl.pathname,
    });
    return fail("SERVER_ERROR", "获取访客统计失败", 500);
  }
}
