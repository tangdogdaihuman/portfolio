"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

interface GlassFilterOptions {
  radius: number;
  bezel?: number;
  displacement?: number;
}

function roundedRectSDF(px: number, py: number, halfW: number, halfH: number, radius: number) {
  const qx = Math.abs(px) - halfW + radius;
  const qy = Math.abs(py) - halfH + radius;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - radius;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function buildDisplacementMap(
  width: number,
  height: number,
  radius: number,
  bezel: number,
  displacement: number
) {
  const scaleDown = Math.min(1, 220 / Math.max(width, height));
  const w = Math.max(16, Math.round(width * scaleDown));
  const h = Math.max(16, Math.round(height * scaleDown));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const image = ctx.createImageData(w, h);
  const data = image.data;
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.min(radius * scaleDown, Math.min(halfW, halfH));
  const bz = Math.max(2, bezel * scaleDown);
  const sdfAt = (x: number, y: number) => roundedRectSDF(x, y, halfW, halfH, r);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x - halfW + 0.5;
      const cy = y - halfH + 0.5;
      const d = sdfAt(cx, cy);
      let dx = 0;
      let dy = 0;
      if (d < 0) {
        const t = Math.min(1, Math.max(0, (d + bz) / bz));
        const profile = Math.pow(smoothstep(t), 1.4);
        if (profile > 0.001) {
          const gx = sdfAt(cx + 1, cy) - sdfAt(cx - 1, cy);
          const gy = sdfAt(cx, cy + 1) - sdfAt(cx, cy - 1);
          const len = Math.hypot(gx, gy) || 1;
          const mag = profile * displacement;
          dx = (gx / len) * mag;
          dy = (gy / len) * mag;
        }
      }
      const i = (y * w + x) * 4;
      data[i] = 128 + (dx / displacement) * 127;
      data[i + 1] = 128 + (dy / displacement) * 127;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL("image/png"), w, h };
}

function supportsSvgBackdrop() {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  return (
    CSS.supports("backdrop-filter", "url(#glass)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#glass)")
  );
}

function subscribeNoop() {
  return () => {};
}

export function useGlassFilter({ radius, bezel = 24, displacement = 14 }: GlassFilterOptions) {
  const rawId = useId();
  const filterId = `lg-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<{ url: string; w: number; h: number } | null>(null);
  const enabled = useSyncExternalStore(subscribeNoop, supportsSvgBackdrop, () => false);
  const frameRef = useRef(0);

  const regenerate = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    setMap(buildDisplacementMap(rect.width, rect.height, radius, bezel, displacement));
  }, [radius, bezel, displacement]);

  useEffect(() => {
    if (!enabled) return;
    regenerate();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(regenerate);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, regenerate]);

  const filterStyle: CSSProperties | undefined =
    enabled && map
      ? ({ "--glass-filter": `url(#${filterId})` } as CSSProperties)
      : undefined;

  const defs =
    enabled && map ? (
      <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feImage href={map.url} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={displacement * 2}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    ) : null;

  return { containerRef, filterStyle, defs, active: enabled && Boolean(map) };
}

export default function GlassSurface({
  radius = 28,
  bezel,
  displacement,
  className = "",
  style,
  children,
}: GlassFilterOptions & {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { containerRef, filterStyle, defs } = useGlassFilter({ radius, bezel, displacement });
  return (
    <div
      ref={containerRef}
      className={`glass glass-refraction ${className}`}
      style={{ borderRadius: radius, ...filterStyle, ...style }}
    >
      {defs}
      {children}
    </div>
  );
}
