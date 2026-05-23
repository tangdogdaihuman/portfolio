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
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

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
            className="block w-full bg-surface cursor-zoom-in"
          >
            <Image
              src={image.image_url}
              alt={`${workTitle} ${index + 1}`}
              width={2400}
              height={3000}
              unoptimized
              sizes="(max-width: 768px) 98vw, 96vw"
              className="w-full h-auto object-contain"
              priority={index === 0}
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
            className="absolute top-6 right-6 text-text-muted hover:text-text z-20 p-2"
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
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text z-20 p-4"
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
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text z-20 p-4"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage.image_url}
            alt={workTitle}
            draggable={false}
            className="max-w-[94vw] max-h-[94vh] object-contain select-none"
            style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, cursor: zoom > 1 ? "grab" : "zoom-in" }}
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
            onClick={(event) => event.stopPropagation()}
          />

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
