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
      <section className="max-w-[112rem] mx-auto px-2 md:px-4 py-6 md:py-14">
        <div className="sticky top-3 z-20 inline-block">
          <Link href="/#works" className="inline-flex bg-bg/80 backdrop-blur-sm border border-border px-4 py-2 text-xs tracking-[0.2em] uppercase text-text-muted hover:border-accent hover:text-accent transition-colors">
            返回作品集
          </Link>
        </div>

        <header className="mt-10 mb-12 md:mb-16">
          <div className="flex flex-wrap items-center gap-3 text-xs text-accent-dim mb-4">
            {work.work_date && <span>{work.work_date}</span>}
            {work.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <h1 className="font-display text-4xl md:text-7xl text-accent leading-none">{work.title}</h1>
          {work.description && (
            <p className="mt-6 max-w-2xl text-sm md:text-base text-text-muted leading-relaxed whitespace-pre-wrap">
              {work.description}
            </p>
          )}
        </header>

        <WorkDetailGallery workTitle={work.title} images={galleryImages} />
      </section>
    </main>
  );
}
