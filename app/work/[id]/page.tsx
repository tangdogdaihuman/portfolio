import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import db, { tagsToArray } from "@/lib/db";
import type { Work, WorkImage } from "@/lib/types";
import WorkDetailGallery from "@/components/work-detail-gallery";

export const revalidate = 30;

async function getWork(id: string): Promise<{ work: Work; images: WorkImage[] } | null> {
  const load = unstable_cache(async () => {
    const result = await db.execute({
      sql: "SELECT * FROM works WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const work = {
      ...row,
      tags: tagsToArray(row.tags),
      pinned: Boolean(row.pinned),
    } as unknown as Work;

    const imageResult = await db.execute({
      sql: "SELECT * FROM work_images WHERE work_id = ? ORDER BY sort_order ASC, created_at ASC",
      args: [id],
    });

    const images = imageResult.rows.length > 0
      ? imageResult.rows as unknown as WorkImage[]
      : [{
          id: "",
          work_id: id,
          image_url: work.image_url,
          thumb_url: work.thumb_url,
          sort_order: 0,
          image_size: work.image_size || 0,
          created_at: work.created_at,
        }];

    return { work, images };
  }, [`work-data:${id}`], { revalidate: 30, tags: ["works", `work:${id}`] });

  return load();
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const data = await getWork(id);
  if (!data) return {};

  return {
    title: data.work.title,
    description: data.work.description,
    openGraph: {
      title: data.work.title,
      description: data.work.description,
      type: "article",
      images: data.work.thumb_url ? [{ url: data.work.thumb_url }] : undefined,
    },
    alternates: {
      canonical: `/work/${id}`,
    },
  };
}

export default async function WorkDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getWork(id);
  if (!data) notFound();

  const { work, images } = data;
  const galleryImages = images.map((image) => ({
    id: image.id,
    image_url: image.image_url,
  }));

  return (
    <main className="min-h-screen bg-bg text-text">
      <section className="max-w-[112rem] mx-auto px-3 md:px-4 py-4 md:py-12">
        <div className="sticky top-3 z-20 inline-block">
          <Link href="/#works" className="inline-flex bg-bg/80 backdrop-blur-sm border border-border px-3 md:px-4 py-2 text-xs tracking-[0.2em] uppercase text-text-muted hover:border-accent hover:text-accent transition-colors">
            返回作品集
          </Link>
        </div>

        <header className="mt-6 md:mt-10 mb-6 md:mb-14 border-b border-border/40 pb-6 md:pb-10">
          <h1 className="font-display text-3xl md:text-7xl text-accent leading-[0.92]">{work.title}</h1>
          <div className="mt-3 md:mt-5 flex flex-wrap items-center gap-2 text-[0.62rem] md:text-[0.68rem] uppercase tracking-[0.16em]">
            {work.work_date && <span className="border border-border/70 px-2 py-0.5 md:px-2.5 md:py-1 text-accent-dim">{work.work_date}</span>}
            {work.tags.map((tag) => <span key={tag} className="border border-border/70 px-2 py-0.5 md:px-2.5 md:py-1 text-text-muted">{tag}</span>)}
          </div>
          {work.description && (
            <details className="mt-4 md:hidden">
              <summary className="text-xs text-text-muted cursor-pointer hover:text-text transition-colors">查看简介</summary>
              <p className="mt-2 text-sm text-text-muted leading-[1.7] whitespace-pre-wrap">{work.description}</p>
            </details>
          )}
          {work.description && (
            <p className="hidden md:block mt-5 max-w-2xl text-sm md:text-base text-text-muted leading-[1.75] whitespace-pre-wrap">{work.description}</p>
          )}
        </header>

        <WorkDetailGallery workTitle={work.title} images={galleryImages} />
      </section>
    </main>
  );
}
