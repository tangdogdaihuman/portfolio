import type { Work, Section } from "@/lib/types";
import db, { tagsToArray } from "@/lib/db";
import HomeClient from "@/components/home-client";

export const revalidate = 30;

async function getData() {
  try {
    const [introRes, worksRes, sectionsRes] = await Promise.all([
      db.execute("SELECT content FROM intro WHERE id = 1"),
      db.execute(
        `SELECT w.*, (SELECT COUNT(*) FROM work_images WHERE work_id = w.id) as image_count
         FROM works w ORDER BY w.pinned DESC, w.sort_order DESC, w.created_at DESC`
      ),
      db.execute("SELECT id, title, content, sort_order, updated_at FROM detail_sections ORDER BY sort_order ASC, created_at ASC"),
    ]);

    const works = worksRes.rows.map((row) => ({
      ...row,
      tags: tagsToArray(row.tags),
      pinned: Boolean(row.pinned),
      image_count: (row.image_count as number) ?? 0,
    })) as unknown as Work[];

    return {
      intro: (introRes.rows[0]?.content as string) || "",
      works,
      sections: sectionsRes.rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        content: row.content as string,
      })) satisfies Section[],
    };
  } catch {
    return { intro: "", works: [], sections: [] };
  }
}

export default async function HomePage() {
  const { intro, works, sections } = await getData();
  return <HomeClient initialIntro={intro} initialWorks={works} initialSections={sections} />;
}
