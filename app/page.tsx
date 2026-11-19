import { unstable_cache } from "next/cache";
import type { Section } from "@/lib/types";
import db from "@/lib/db";
import HomeClient from "@/components/home-client";
import VisitTracker from "@/components/visit-tracker";
import { getHomeWorks } from "@/lib/home-works";

export const revalidate = 300;

const getMeta = unstable_cache(
  async () => {
    const [introRes, sectionsRes] = await Promise.all([
      db.execute("SELECT content, tagline FROM intro WHERE id = 1"),
      db.execute("SELECT id, title, content, sort_order, updated_at FROM detail_sections ORDER BY sort_order ASC, created_at ASC"),
    ]);

    return {
      intro: (introRes.rows[0]?.content as string) || "",
      tagline: (introRes.rows[0]?.tagline as string) || "",
      sections: sectionsRes.rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        content: row.content as string,
      })) satisfies Section[],
    };
  },
  ["home-meta"],
  { revalidate: 300, tags: ["intro", "detail-sections"] }
);

export default async function HomePage() {
  const [meta, works] = await Promise.all([getMeta(), getHomeWorks()]);
  return (
    <>
      <VisitTracker />
      <HomeClient
        initialIntro={meta.intro}
        initialTagline={meta.tagline}
        initialWorks={works}
        initialSections={meta.sections}
        initialLoadError={false}
      />
    </>
  );
}
