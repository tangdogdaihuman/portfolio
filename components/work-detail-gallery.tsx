"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

interface GalleryImage {
  id: string;
  image_url: string;
}

export default function WorkDetailGallery({
  workTitle,
  images,
}: {
  workTitle: string;
  images: GalleryImage[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [readyMap, setReadyMap] = useState<Record<string, true>>({});
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number } | null>(null);

  const activeImage = openIndex !== null ? images[openIndex] : null;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const closeViewer = useCallback(() => {
    setOpenIndex(null);
    resetView();
  }, [resetView]);

  useEffect(() => {
    if (openIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowRight" && openIndex < images.length - 1) {
        setOpenIndex((index) => (index ?? 0) + 1);
        resetView();
      }
      if (event.key === "ArrowLeft" && openIndex > 0) {
        setOpenIndex((index) => (index ?? 0) - 1);
        resetView();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex, images.length, closeViewer, resetView]);

  return (
    <>
      <div className="space-y-6 md:space-y-10">
        {images.map((image, index) => (
          <button
            key={image.id || index}
            type="button"
            onClick={() => {
              setOpenIndex(index);
              resetView();
            }}
            className="block w-full bg-surface cursor-zoom-in border border-border/35"
          >
            <Image
              src={image.image_url}
              alt={`${workTitle} ${index + 1}`}
              width={2400}
              height={3000}
              unoptimized
              sizes="(max-width: 768px) 98vw, 96vw"
              className={`w-full h-auto object-contain transition-opacity duration-500 ${readyMap[image.id || String(index)] ? "opacity-100" : "opacity-0"}`}
              priority={index === 0}
              onLoad={() => {
                const key = image.id || String(index);
                setReadyMap((current) => (current[key] ? current : { ...current, [key]: true }));
              }}
            />
          </button>
        ))}
      </div>

      {activeImage && (
        <div className="fixed inset-0 z-[90] bg-bg/96 flex items-center justify-center" onClick={closeViewer}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              closeViewer();
            }}
            className="absolute top-6 right-6 text-text-muted hover:text-text z-20 p-2 bg-bg/75 border border-border/50"
            aria-label="关闭大图"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>

          {openIndex !== null && openIndex > 0 && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setOpenIndex((index) => (index ?? 0) - 1);
                resetView();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text z-20 p-4 bg-bg/75 border border-border/50"
              aria-label="上一张"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}

          {openIndex !== null && openIndex < images.length - 1 && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setOpenIndex((index) => (index ?? 0) + 1);
                resetView();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text z-20 p-4 bg-bg/75 border border-border/50"
              aria-label="下一张"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}

          <div className="absolute left-4 top-6 z-20 text-[0.62rem] tracking-[0.15em] uppercase text-text-muted bg-bg/75 border border-border/50 px-3 py-2">
            双击缩放 · 拖拽查看细节
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage.image_url}
            alt={workTitle}
            draggable={false}
            className="max-w-[97vw] max-h-[97vh] object-contain select-none"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
              cursor: zoom > 1 ? "grab" : "zoom-in",
              touchAction: zoom > 1 ? "none" : "pan-y",
            }}
            onWheel={(event) => {
              event.stopPropagation();
              setZoom((currentZoom) => Math.min(5, Math.max(1, currentZoom - event.deltaY * 0.001)));
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setZoom((currentZoom) => (currentZoom > 1 ? 1 : 2));
              setPan({ x: 0, y: 0 });
            }}
            onMouseDown={(event) => {
              if (zoom <= 1) return;
              event.stopPropagation();
              event.preventDefault();
              dragRef.current = { sx: event.clientX, sy: event.clientY, px: pan.x, py: pan.y };
              (event.target as HTMLElement).style.cursor = "grabbing";

              const onMove = (moveEvent: MouseEvent) => {
                if (!dragRef.current) return;
                setPan({
                  x: dragRef.current.px + (moveEvent.clientX - dragRef.current.sx) / zoom,
                  y: dragRef.current.py + (moveEvent.clientY - dragRef.current.sy) / zoom,
                });
              };

              const onUp = () => {
                dragRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };

              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              swipeRef.current = { x: touch.clientX, y: touch.clientY };
              touchPanRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchMove={(event) => {
              if (zoom <= 1 || !touchPanRef.current) return;
              const touch = event.touches[0];
              const prev = touchPanRef.current;
              setPan((currentPan) => ({
                x: currentPan.x + (touch.clientX - prev.x) / zoom,
                y: currentPan.y + (touch.clientY - prev.y) / zoom,
              }));
              touchPanRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              touchPanRef.current = null;
              if (!swipeRef.current || zoom > 1) {
                swipeRef.current = null;
                return;
              }
              const touch = event.changedTouches[0];
              const dx = touch.clientX - swipeRef.current.x;
              const dy = touch.clientY - swipeRef.current.y;
              swipeRef.current = null;
              if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
              event.stopPropagation();
              if (dx < 0 && openIndex !== null && openIndex < images.length - 1) {
                setOpenIndex((index) => (index ?? 0) + 1);
                resetView();
              }
              if (dx > 0 && openIndex !== null && openIndex > 0) {
                setOpenIndex((index) => (index ?? 0) - 1);
                resetView();
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />

          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-bg/78 border border-border/55 px-2 py-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setZoom((currentZoom) => Math.max(1, currentZoom - 0.25));
              }}
              className="w-8 h-8 text-text-muted hover:text-text border border-border/40"
              aria-label="缩小"
            >
              −
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                resetView();
              }}
              className="px-3 h-8 text-[0.65rem] tracking-[0.15em] uppercase text-text-muted hover:text-text border border-border/40"
            >
              重置
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setZoom((currentZoom) => Math.min(5, currentZoom + 0.25));
              }}
              className="w-8 h-8 text-text-muted hover:text-text border border-border/40"
              aria-label="放大"
            >
              +
            </button>
          </div>

          {openIndex !== null && images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-text-muted/50 tracking-wider">
              {openIndex + 1} / {images.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
