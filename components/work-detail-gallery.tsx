"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

interface GalleryImage {
  id: string;
  image_url: string;
}

const SWIPE_OFFSET_THRESHOLD = 68;
const SWIPE_VELOCITY_THRESHOLD = 520;

export default function WorkDetailGallery({
  workTitle,
  images,
}: {
  workTitle: string;
  images: GalleryImage[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<0 | 1 | -1>(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [readyMap, setReadyMap] = useState<Record<string, true>>({});
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    startZoom: number;
    centerX: number;
    centerY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastOpenIndexRef = useRef<number | null>(null);

  const activeImage = openIndex !== null ? images[openIndex] : null;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const setZoomSafe = useCallback((value: number) => {
    setZoom(Math.min(5, Math.max(1, value)));
  }, []);

  const calcDistance = (
    a: { clientX: number; clientY: number },
    b: { clientX: number; clientY: number }
  ) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const calcMidpoint = (
    a: { clientX: number; clientY: number },
    b: { clientX: number; clientY: number }
  ) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

  const goNext = useCallback(() => {
    setOpenIndex((index) => {
      if (index === null || index >= images.length - 1) return index;
      setSlideDirection(1);
      return index + 1;
    });
    resetView();
  }, [images.length, resetView]);

  const goPrev = useCallback(() => {
    setOpenIndex((index) => {
      if (index === null || index <= 0) return index;
      setSlideDirection(-1);
      return index - 1;
    });
    resetView();
  }, [resetView]);

  const handleSwipeByDrag = useCallback((info: PanInfo) => {
    if (zoom > 1) return;
    const offsetX = info.offset.x;
    const velocityX = info.velocity.x;
    const hitOffset = Math.abs(offsetX) >= SWIPE_OFFSET_THRESHOLD;
    const hitVelocity = Math.abs(velocityX) >= SWIPE_VELOCITY_THRESHOLD;
    if (!hitOffset && !hitVelocity) return;

    if (offsetX < 0 || velocityX < -SWIPE_VELOCITY_THRESHOLD) {
      goNext();
      return;
    }
    goPrev();
  }, [goNext, goPrev, zoom]);

  const closeViewer = useCallback(() => {
    const restoreIndex = lastOpenIndexRef.current;
    setOpenIndex(null);
    resetView();
    if (restoreIndex !== null) {
      requestAnimationFrame(() => {
        triggerRefs.current[restoreIndex]?.focus();
      });
    }
  }, [resetView]);

  const openViewer = useCallback((index: number) => {
    lastOpenIndexRef.current = index;
    setSlideDirection(0);
    setOpenIndex(index);
    resetView();
  }, [resetView]);

  useEffect(() => {
    if (openIndex === null) return;
    lastOpenIndexRef.current = openIndex;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowRight" && openIndex < images.length - 1) goNext();
      if (event.key === "ArrowLeft" && openIndex > 0) goPrev();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex, images.length, closeViewer, goNext, goPrev]);

  return (
    <>
      <div className="space-y-6 md:space-y-10">
        {images.map((image, index) => (
          <button
            key={image.id || index}
            ref={(element) => { triggerRefs.current[index] = element; }}
            type="button"
            onClick={() => openViewer(index)}
            tabIndex={activeImage ? -1 : 0}
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${workTitle} 图片查看器`}
          className="fixed inset-0 z-[90] bg-bg/96 flex items-center justify-center"
          onClick={closeViewer}
        >
          <button
            ref={closeButtonRef}
            onClick={(event) => {
              event.stopPropagation();
              closeViewer();
            }}
            className="absolute top-6 right-6 text-text-muted hover:text-text z-20 w-11 h-11 inline-flex items-center justify-center bg-bg/75 border border-border/50"
            aria-label="关闭大图"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>

          {openIndex !== null && openIndex > 0 && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                goPrev();
              }}
              className="hidden md:inline-flex absolute left-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text z-20 w-11 h-11 items-center justify-center bg-bg/75 border border-border/50"
              aria-label="上一张"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}

          {openIndex !== null && openIndex < images.length - 1 && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                goNext();
              }}
              className="hidden md:inline-flex absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text z-20 w-11 h-11 items-center justify-center bg-bg/75 border border-border/50"
              aria-label="下一张"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}

          <div className="absolute left-4 top-6 z-20 text-[0.62rem] tracking-[0.15em] uppercase text-text-muted bg-bg/75 border border-border/50 px-3 py-2">
            双指缩放/平移 · 单指滑动切图
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeImage.id || String(openIndex)}
              custom={slideDirection}
              initial={{ x: slideDirection === 0 ? 0 : slideDirection * 86 }}
              animate={{ x: 0 }}
              exit={{ x: slideDirection === 0 ? 0 : slideDirection * -86 }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.7 }}
              drag={zoom > 1 ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.14}
              dragMomentum
              onDragEnd={(_, info) => handleSwipeByDrag(info)}
              className="max-w-[97vw] max-h-[97vh] flex items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <Image
                src={activeImage.image_url}
                alt={workTitle}
                width={2400}
                height={3000}
                unoptimized
                sizes="97vw"
                draggable={false}
                className="max-w-[97vw] max-h-[97vh] object-contain select-none"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  cursor: zoom > 1 ? "grab" : "zoom-in",
                  touchAction: "none",
                }}
                onWheel={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setZoomSafe(zoom - event.deltaY * 0.001);
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
                  if (event.touches.length === 2) {
                    const midpoint = calcMidpoint(event.touches[0], event.touches[1]);
                    pinchRef.current = {
                      distance: calcDistance(event.touches[0], event.touches[1]),
                      startZoom: zoom,
                      centerX: midpoint.x,
                      centerY: midpoint.y,
                      startPanX: pan.x,
                      startPanY: pan.y,
                    };
                    touchPanRef.current = null;
                    return;
                  }
                  if (event.touches.length !== 1 || zoom <= 1) {
                    touchPanRef.current = null;
                    return;
                  }
                  const touch = event.touches[0];
                  touchPanRef.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchMove={(event) => {
                  if (event.touches.length === 2 && pinchRef.current) {
                    event.preventDefault();
                    const nextDistance = calcDistance(event.touches[0], event.touches[1]);
                    const scaleFactor = nextDistance / pinchRef.current.distance;
                    const nextZoom = Math.min(5, Math.max(1, pinchRef.current.startZoom * scaleFactor));
                    const midpoint = calcMidpoint(event.touches[0], event.touches[1]);
                    setZoom(nextZoom);
                    setPan({
                      x: pinchRef.current.startPanX + (midpoint.x - pinchRef.current.centerX) / nextZoom,
                      y: pinchRef.current.startPanY + (midpoint.y - pinchRef.current.centerY) / nextZoom,
                    });
                    return;
                  }
                  if (event.touches.length !== 1 || zoom <= 1 || !touchPanRef.current) return;
                  event.preventDefault();
                  const touch = event.touches[0];
                  const prev = touchPanRef.current;
                  setPan((currentPan) => ({
                    x: currentPan.x + (touch.clientX - prev.x) / zoom,
                    y: currentPan.y + (touch.clientY - prev.y) / zoom,
                  }));
                  touchPanRef.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchEnd={(event) => {
                  if (pinchRef.current && event.touches.length < 2) {
                    pinchRef.current = null;
                    if (zoom > 1) return;
                    setPan({ x: 0, y: 0 });
                  }
                  if (event.touches.length === 0) {
                    touchPanRef.current = null;
                  }
                }}
                onClick={(event) => event.stopPropagation()}
              />
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-bg/78 border border-border/55 px-2 py-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setZoomSafe(zoom - 0.25);
              }}
              className="w-11 h-11 text-text-muted hover:text-text border border-border/40"
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
              className="px-3 h-11 text-[0.65rem] tracking-[0.15em] uppercase text-text-muted hover:text-text border border-border/40"
            >
              重置
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setZoomSafe(zoom + 0.25);
              }}
              className="w-11 h-11 text-text-muted hover:text-text border border-border/40"
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
