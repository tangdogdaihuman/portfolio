"use client";

import { useState, useMemo, useEffect, useRef } from "react";

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
}

interface ImageItem {
  id: string;
  image_url: string;
  thumb_url: string;
}

interface WorkGridProps {
  works: Work[];
}

export default function WorkGrid({ works }: WorkGridProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [fullImage, setFullImage] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    works.forEach((w) => w.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet);
  }, [works]);

  const filtered = useMemo(() => {
    if (!activeTag) return works;
    return works.filter((w) => w.tags.includes(activeTag));
  }, [works, activeTag]);

  const toggleExpand = async (workId: string) => {
    if (expandedId === workId) {
      setExpandedId(null);
      setImages([]);
      return;
    }
    setExpandedId(workId);
    setLoadingImages(true);
    const res = await fetch(`/api/works/${workId}/images`);
    if (res.ok) {
      const data = await res.json();
      setImages(data);
    }
    setLoadingImages(false);
  };

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
        <div className="flex flex-wrap gap-3 mb-16 justify-center">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-5 py-2 text-sm tracking-wide transition-colors ${
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
              className={`px-5 py-2 text-sm tracking-wide transition-colors ${
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

      <div className="space-y-1">
        {filtered.map((work) => {
          const isExpanded = expandedId === work.id;
          return (
            <div key={work.id} className="border-b border-border/30">
              {/* Work header - clickable */}
              <button
                onClick={() => toggleExpand(work.id)}
                className="w-full flex items-center gap-4 md:gap-6 py-5 px-2 text-left hover:bg-surface/50 transition-colors group"
              >
                <div className="w-16 h-12 md:w-20 md:h-14 flex-shrink-0 overflow-hidden bg-surface">
                  <img
                    src={work.thumb_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base md:text-lg text-text truncate">
                      {work.title}
                    </h3>
                    {work.pinned && (
                      <span className="text-[10px] uppercase tracking-widest bg-accent text-bg px-1.5 py-0.5 flex-shrink-0">
                        Top
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {work.work_date && (
                      <span className="text-xs text-text-muted">{work.work_date}</span>
                    )}
                    {work.tags.length > 0 && (
                      <span className="text-xs text-accent-dim">
                        {work.tags.slice(0, 3).join(" · ")}
                      </span>
                    )}
                    {(work.image_count || 1) > 1 && (
                      <span className="text-xs text-text-muted/50">{work.image_count} 张</span>
                    )}
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded images */}
              <div
                className={`overflow-hidden transition-all duration-500 ease-out ${
                  isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="px-2 pb-6">
                  {loadingImages ? (
                    <div className="text-text-muted text-sm py-8 text-center">加载中...</div>
                  ) : images.length > 0 ? (
                    <>
                      {work.description && (
                        <p className="text-text-muted text-sm mb-6 max-w-2xl leading-relaxed">
                          {work.description}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {images.map((img, i) => (
                          <LazyImage
                            key={img.id || i}
                            src={img.thumb_url}
                            fullSrc={img.image_url}
                            alt={`${work.title} ${i + 1}`}
                            onClick={() => setFullImage(img.image_url)}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fullscreen image overlay */}
      {fullImage && (
        <div
          className="fixed inset-0 z-50 bg-bg/95 flex items-center justify-center cursor-zoom-out"
          onClick={() => setFullImage(null)}
        >
          <button
            onClick={() => setFullImage(null)}
            className="absolute top-6 right-6 text-text-muted hover:text-text z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <img
            src={fullImage}
            alt=""
            className="max-w-[95vw] max-h-[95vh] object-contain animate-fade-up"
          />
        </div>
      )}
    </>
  );
}

function LazyImage({
  src,
  fullSrc,
  alt,
  onClick,
}: {
  src: string;
  fullSrc: string;
  alt: string;
  onClick: () => void;
}) {
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
    <div ref={ref} onClick={onClick} className="aspect-[4/3] bg-surface overflow-hidden cursor-zoom-in group">
      {inView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-105 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoaded(true)}
        />
      )}
      {!loaded && <div className="w-full h-full bg-surface animate-pulse" />}
    </div>
  );
}
