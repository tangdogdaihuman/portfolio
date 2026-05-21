"use client";

import { useEffect, useCallback, useState } from "react";

interface Work {
  id: string;
  title: string;
  description: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  work_date: string;
  image_count: number;
}

interface ImageItem {
  image_url: string;
  thumb_url: string;
}

interface LightboxProps {
  works: Work[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function Lightbox({
  works,
  index,
  onClose,
  onNavigate,
}: LightboxProps) {
  const work = works[index];
  const hasPrev = index > 0;
  const hasNext = index < works.length - 1;
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imgIndex, setImgIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setImgIndex(0);
    setLoading(true);
    fetch(`/api/works/${work.id}/images`)
      .then((r) => r.json())
      .then((data) => {
        if (data.length > 0) {
          setImages(data);
        } else {
          setImages([{ image_url: work.image_url, thumb_url: work.thumb_url }]);
        }
      })
      .finally(() => setLoading(false));
  }, [work.id, work.image_url, work.thumb_url]);

  const hasImgPrev = imgIndex > 0;
  const hasImgNext = imgIndex < images.length - 1;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        if (hasImgNext) setImgIndex((i) => i + 1);
        else if (hasNext) onNavigate(index + 1);
      }
      if (e.key === "ArrowLeft") {
        if (hasImgPrev) setImgIndex((i) => i - 1);
        else if (hasPrev) onNavigate(index - 1);
      }
    },
    [hasImgNext, hasImgPrev, hasNext, hasPrev, index, onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (!work) return null;

  const currentImage = images[imgIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-text-muted hover:text-text transition-colors z-10"
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors z-10"
          aria-label="Previous work"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors z-10"
          aria-label="Next work"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <div className="flex flex-col items-center max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {hasImgPrev && (
          <button
            onClick={() => setImgIndex((i) => i - 1)}
            className="absolute left-8 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text transition-colors z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        {hasImgNext && (
          <button
            onClick={() => setImgIndex((i) => i + 1)}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text transition-colors z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {loading ? (
          <div className="text-text-muted">加载中...</div>
        ) : currentImage ? (
          <img
            src={currentImage.image_url}
            alt={work.title}
            className="max-w-full max-h-[70vh] object-contain transition-opacity duration-200"
          />
        ) : null}

        <div className="mt-6 text-center max-w-lg">
          <h2 className="font-display text-2xl text-text">{work.title}</h2>
          {work.work_date && (
            <p className="mt-1 text-sm text-accent-dim">{work.work_date}</p>
          )}
          {work.description && (
            <p className="mt-2 text-text-muted leading-relaxed">{work.description}</p>
          )}
          {work.tags.length > 0 && (
            <div className="mt-3 flex gap-2 justify-center flex-wrap">
              {work.tags.map((tag) => (
                <span key={tag} className="text-xs text-accent-dim border border-border px-2 py-0.5">{tag}</span>
              ))}
            </div>
          )}
          {images.length > 1 && (
            <p className="mt-2 text-xs text-text-muted/50">
              {imgIndex + 1} / {images.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
