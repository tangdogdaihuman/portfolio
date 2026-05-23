import type { MetadataRoute } from "next";
import db from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: "https://tangzihang.top", lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const works = await db.execute("SELECT id, updated_at FROM works ORDER BY created_at DESC");
    const workEntries: MetadataRoute.Sitemap = works.rows.map((row) => ({
      url: `https://tangzihang.top/work/${row.id}`,
      lastModified: new Date((row.updated_at as string) || Date.now()),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
    return [...base, ...workEntries];
  } catch {
    return base;
  }
}
