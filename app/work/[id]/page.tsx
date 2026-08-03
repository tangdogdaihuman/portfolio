import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import db from "@/lib/db";
import type { Work, WorkImage } from "@/lib/types";
import WorkDetailGallery from "@/components/work-detail-gallery";
import BackToTopButton from "@/components/back-to-top-button";
import { rowToWork, rowToWorkImage } from "@/lib/work-mappers";

export const revalidate = 30;

async function getWork(id: string): Promise<{ work: Work; images: WorkImage[] } | null> {
  const load = unstable_cache(async () => {
    const result = await db.execute({
      sql: "SELECT * FROM works WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) return null;
    const work = rowToWork(result.rows[0] as Record<string, unknown>);

    const imageResult = await db.execute({
      sql: "SELECT * FROM work_images WHERE work_id = ? ORDER BY sort_order ASC, created_at ASC",
      args: [id],
    });

    const images = imageResult.rows.length > 0
      ? imageResult.rows.map((row) => rowToWorkImage(row as Record<string, unknown>))
      : [{
          id: "",
          work_id: id,
          image_url: work.image_url,
          thumb_url: work.thumb_url,
          media_type: "image",
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
    thumb_url: image.thumb_url,
    media_type: image.media_type,
  }));

  return (
    <main className="min-h-screen bg-bg text-text">
      <section className="max-w-[112rem] mx-auto px-2 md:px-4 py-6 md:py-12">
        <div className="sticky top-3 z-20 inline-block">
          <Link href="/#works" className="group inline-flex items-center gap-2.5 bg-bg/80 backdrop-blur-sm border border-border/70 px-4 py-2 text-[0.68rem] tracking-[0.22em] uppercase text-text-muted hover:border-accent/70 hover:text-accent transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="transition-transform duration-300 group-hover:-translate-x-0.5"><polyline points="15 18 9 12 15 6" /></svg>
            返回作品集
          </Link>
        </div>

        <header className="mt-10 md:mt-14 mb-12 md:mb-16 border-b border-border/40 pb-10 md:pb-12">
          <div className="grid md:grid-cols-12 gap-8 md:gap-10 items-end">
            <div className="md:col-span-8">
              <div className="flex items-center gap-3 mb-6 md:mb-8 animate-fade-up">
                <span className="divider-line" />
                <span className="text-[0.62rem] md:text-[0.68rem] tracking-[0.3em] uppercase text-text-muted">Work Detail / 作品详情</span>
              </div>
              <h1 className="font-display text-4xl md:text-7xl text-accent leading-[0.95] tracking-tight animate-fade-up [animation-delay:0.08s]">{work.title}</h1>
              {work.description && (
                <p className="mt-6 max-w-2xl text-sm md:text-base text-text-muted leading-[1.9] whitespace-pre-wrap animate-fade-up [animation-delay:0.16s]">
                  {work.description}
                </p>
              )}
            </div>
            <div className="md:col-span-4 md:justify-self-end md:self-end">
              <div className="flex flex-wrap md:justify-end items-center gap-2 text-[0.66rem] uppercase tracking-[0.18em]">
                {work.work_date && (
                  <span className="px-3 py-1.5 border border-accent/45 bg-accent/[0.06] text-accent">{work.work_date}</span>
                )}
                {work.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1.5 border border-border/70 bg-surface/50 text-text-muted transition-colors hover:border-accent/50 hover:text-accent">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </header>

        <WorkDetailGallery workTitle={work.title} images={galleryImages} />

        {work.software.length > 0 && (
          <section className="mt-12 md:mt-16 border-t border-border/40 pt-8 md:pt-10">
            <div className="flex items-center gap-3 mb-5">
              <span className="divider-line" />
              <h2 className="text-[0.68rem] tracking-[0.28em] uppercase text-text-muted">Software / 使用软件</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {work.software.map((item) => (
                <span key={item} className="px-3 py-1.5 border border-border/70 bg-surface/50 text-[0.7rem] tracking-[0.1em] text-text-muted transition-colors hover:border-accent/50 hover:text-accent">
                  {item}
                </span>
              ))}
            </div>
          </section>
        )}
      </section>
      <BackToTopButton />
    </main>
  );
}
