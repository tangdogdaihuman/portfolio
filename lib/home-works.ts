import { unstable_cache } from "next/cache";
import db from "@/lib/db";
import { rowToHomeWork } from "@/lib/work-mappers";
import type { HomeWork } from "@/lib/types";

const HOME_WORKS_SQL = `
  SELECT w.id, w.title, w.thumb_url, w.tags, w.work_date, w.pinned, w.size_weight,
         (SELECT COUNT(*) FROM work_images WHERE work_id = w.id) as image_count
  FROM works w
  ORDER BY w.pinned DESC, w.sort_order DESC, w.created_at DESC
`;

export async function loadHomeWorks(): Promise<HomeWork[]> {
  const result = await db.execute(HOME_WORKS_SQL);
  return result.rows.map((row) => rowToHomeWork(row as Record<string, unknown>));
}

export const getHomeWorks = unstable_cache(loadHomeWorks, ["home-works-list"], {
  revalidate: 300,
  tags: ["works"],
});
