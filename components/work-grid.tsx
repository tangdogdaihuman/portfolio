"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Lightbox from "@/components/lightbox";

interface Work {
  id: string;
  title: string;
  description: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  work_date: string;
  image_count: number;
  pinned: boolean;
  sort_order: number;
  created_at: string;
}

interface WorkGridProps {
  works: Work[];
}

export default function WorkGrid({ works }: WorkGridProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    works.forEach((w) => w.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet);
  }, [works]);

  const filtered = useMemo(() => {
    if (!activeTag) return works;
    return works.filter((w) => w.tags.includes(activeTag));
  }, [works, activeTag]);

  if (works.length === 0) {
    return (
      <div className="text-center py-20 text-text-muted">
        <p className="text-lg">还没有作品</p>
      </div>
    );
  }

  return (
    <>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-12 justify-center">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-4 py-1.5 text-sm tracking-wide transition-colors ${
              activeTag === null
                ? "bg-accent text-bg"
                : "border border-border text-text-muted hover:text-text hover:border-text-muted"
            }`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-4 py-1.5 text-sm tracking-wide transition-colors ${
                activeTag === tag
                  ? "bg-accent text-bg"
                  : "border border-border text-text-muted hover:text-text hover:border-text-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
        {filtered.map((work, i) => (
          <LazyImage
            key={work.id}
            work={work}
            onClick={() => setLightboxIndex(i)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          works={filtered}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}

function LazyImage({ work, onClick }: { work: Work; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="break-inside-avoid cursor-pointer group relative overflow-hidden bg-surface"
    >
      {inView && (
        <img
          src={work.thumb_url}
          alt={work.title}
          className={`w-full h-auto transition-all duration-700 group-hover:scale-105 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoaded(true)}
        />
      )}
      <div
        className={`absolute inset-0 bg-surface animate-pulse ${
          loaded ? "hidden" : "block"
        }`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
        <div>
          <h3 className="font-display text-lg text-text">{work.title}</h3>
          {work.work_date && (
            <p className="text-xs text-text-muted mt-1">{work.work_date}</p>
          )}
          {work.tags.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {work.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-accent-dim border border-accent-dim/30 px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {work.pinned && (
        <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest bg-accent text-bg px-2 py-0.5">
          Top
        </span>
      )}
      {(work.image_count || 1) > 1 && (
        <span className="absolute top-3 right-3 text-[10px] bg-bg/70 text-text-muted px-2 py-0.5">
          {work.image_count} 张
        </span>
      )}
    </div>
  );
}
