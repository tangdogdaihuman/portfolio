import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import db from "@/lib/db";
import type { Work, WorkImage } from "@/lib/types";
import WorkDetailGallery from "@/components/work-detail-gallery";
import BackToTopButton from "@/components/back-to-top-button";
import ThemeToggle from "@/components/theme-toggle";
import VisitTracker from "@/components/visit-tracker";
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
    <main className="relative min-h-screen">
      <VisitTracker />
      <header className="fixed left-1/2 top-4 z-[70] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2">
        <nav className="glass-strong animate-fade-up flex items-center justify-between gap-2 rounded-full py-1.5 pl-2 pr-1.5">
          <Link
            href="/#works"
            data-hover
            className="glass-chip inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[0.72rem] tracking-[0.12em] text-text transition-colors duration-300 hover:text-accent-strong"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            返回作品集
          </Link>
          <span className="meta-label hidden min-w-0 flex-1 truncate text-center sm:block">{work.title}</span>
          <ThemeToggle />
        </nav>
      </header>

      <article className="mx-auto max-w-6xl px-5 pb-24 pt-32 md:px-8 md:pt-40">
        <header>
          <p className="meta-label animate-fade-up">
            Work Detail{work.work_date ? ` — ${work.work_date}` : ""}
          </p>
          <h1 className="animate-fade-up font-display mt-5 text-[clamp(2.4rem,7vw,5.2rem)] leading-[1.02] tracking-tight text-text [animation-delay:0.06s]">
            {work.title}
          </h1>
          {work.description && (
            <p className="animate-fade-up mt-6 max-w-2xl whitespace-pre-wrap text-[0.95rem] leading-[1.9] text-text-muted [animation-delay:0.12s]">
              {work.description}
            </p>
          )}
        </header>

        <dl className="glass animate-fade-up mt-10 flex flex-wrap gap-x-12 gap-y-7 rounded-[24px] p-6 [animation-delay:0.18s] md:p-7">
          {work.work_date && (
            <div>
              <dt className="meta-label">创作日期</dt>
              <dd className="mt-2.5 font-display text-lg text-text">{work.work_date}</dd>
            </div>
          )}
          <div>
            <dt className="meta-label">媒体数量</dt>
            <dd className="mt-2.5 font-display text-lg text-text">
              {images.length} <span className="text-sm text-text-muted">件</span>
            </dd>
          </div>
          {work.tags.length > 0 && (
            <div className="min-w-40">
              <dt className="meta-label">标签</dt>
              <dd className="mt-2.5 flex flex-wrap gap-1.5">
                {work.tags.map((tag) => (
                  <span key={tag} className="glass-chip rounded-full px-3 py-1 text-[0.7rem] tracking-[0.08em] text-text-muted">
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {work.software.length > 0 && (
            <div className="min-w-40">
              <dt className="meta-label">使用软件</dt>
              <dd className="mt-2.5 flex flex-wrap gap-1.5">
                {work.software.map((item) => (
                  <span key={item} className="glass-chip rounded-full px-3 py-1 text-[0.7rem] tracking-[0.08em] text-text-muted">
                    {item}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <section className="mt-14 md:mt-20">
          <WorkDetailGallery workTitle={work.title} images={galleryImages} />
        </section>
      </article>

      <BackToTopButton />
    </main>
  );
}
