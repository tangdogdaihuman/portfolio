import { unstable_cache } from "next/cache";
import type { Section } from "@/lib/types";
import db from "@/lib/db";
import HomeClient from "@/components/home-client";
import { rowToWork } from "@/lib/work-mappers";

export const revalidate = 30;

const getData = unstable_cache(async () => {
  try {
    const [introRes, worksRes, sectionsRes] = await Promise.all([
      db.execute("SELECT content, tagline FROM intro WHERE id = 1"),
      db.execute(
        `SELECT w.*, (SELECT COUNT(*) FROM work_images WHERE work_id = w.id) as image_count
         FROM works w ORDER BY w.pinned DESC, w.sort_order DESC, w.created_at DESC`
      ),
      db.execute("SELECT id, title, content, sort_order, updated_at FROM detail_sections ORDER BY sort_order ASC, created_at ASC"),
    ]);

    const works = worksRes.rows.map((row) => rowToWork(row as Record<string, unknown>));

    return {
      intro: (introRes.rows[0]?.content as string) || "",
      tagline: (introRes.rows[0]?.tagline as string) || "",
      works,
      sections: sectionsRes.rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        content: row.content as string,
      })) satisfies Section[],
      loadError: false,
    };
  } catch {
    return { intro: "", tagline: "", works: [], sections: [], loadError: true };
  }
}, ["home-data"], { revalidate: 30, tags: ["works", "intro", "detail-sections"] });

export default async function HomePage() {
  const { intro, tagline, works, sections, loadError } = await getData();
  return <HomeClient initialIntro={intro} initialTagline={tagline} initialWorks={works} initialSections={sections} initialLoadError={loadError} />;
}
