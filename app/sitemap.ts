import type { MetadataRoute } from "next";
import db from "@/lib/db";

export const revalidate = 600;

function parseSqliteTimestamp(value: unknown): Date {
  if (typeof value !== "string") return new Date();
  const normalized = value.trim().replace(" ", "T");
  if (!normalized) return new Date();
  const withZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://tangzihang.top").replace(/\/+$/, "");
  const base: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const works = await db.execute("SELECT id, updated_at FROM works ORDER BY created_at DESC");
    const workEntries: MetadataRoute.Sitemap = works.rows.map((row) => ({
      url: `${baseUrl}/work/${row.id}`,
      lastModified: parseSqliteTimestamp(row.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
    return [...base, ...workEntries];
  } catch {
    return base;
  }
}
