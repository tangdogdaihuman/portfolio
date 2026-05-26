"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createNoise3D } from "simplex-noise";
import { useResolvedTheme } from "@/lib/theme-client";

const RAY_COUNT = 500;
const RAY_PROPS = 8;
const BASE_LEN = 200;
const RANGE_LEN = 200;
const BASE_SPEED = 0.05;
const RANGE_SPEED = 0.1;
const BASE_WIDTH = 10;
const RANGE_WIDTH = 20;
const BASE_TTL = 50;
const RANGE_TTL = 100;
const NOISE_STRENGTH = 100;
const BASE_HUE = 34;
const RANGE_HUE = 22;
const X_OFF = 0.0015;
const Y_OFF = 0.0015;
const Z_OFF = 0.0015;

const cssRibbons = [
  { left: "3%", width: "9%", opacity: 0.44, delay: "0s", duration: "18s" },
  { left: "14%", width: "7%", opacity: 0.24, delay: "-5s", duration: "22s" },
  { left: "24%", width: "11%", opacity: 0.3, delay: "-2s", duration: "20s" },
  { left: "38%", width: "8%", opacity: 0.2, delay: "-9s", duration: "24s" },
  { left: "49%", width: "12%", opacity: 0.27, delay: "-4s", duration: "19s" },
  { left: "64%", width: "8%", opacity: 0.18, delay: "-11s", duration: "25s" },
  { left: "74%", width: "12%", opacity: 0.31, delay: "-7s", duration: "21s" },
  { left: "89%", width: "8%", opacity: 0.36, delay: "-6s", duration: "18s" },
];

function shouldUseCssFallback() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return true;
  const supportsFilter = "filter" in probe;
  const supportsComposite = typeof probe.globalCompositeOperation === "string";
  return !supportsFilter || !supportsComposite;
}

function subscribeToNothing() {
  return () => {};
}

function getPerformanceProfile() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory) ?? 4;
  const lowEnd = coarsePointer && (cores <= 4 || memory <= 4);

  return {
    reducedMotion,
    coarsePointer,
    lowEnd,
    baseScale: lowEnd ? 0.86 : coarsePointer ? 0.6 : 1,
    dynamicScale: lowEnd ? 0.72 : coarsePointer ? 0.5 : 0.96,
    targetFps: reducedMotion ? 0 : lowEnd ? 30 : coarsePointer ? 30 : 60,
    mainBlur: lowEnd ? 9 : coarsePointer ? 12 : 12,
    bloomBlur: lowEnd ? 16 : coarsePointer ? 18 : 20,
    bloomAlpha: lowEnd ? 0.18 : coarsePointer ? 0.12 : 0.26,
    rayQuality: lowEnd ? 0.62 : coarsePointer ? 0.35 : 1,
    speedQuality: lowEnd ? 0.82 : coarsePointer ? 0.9 : 1,
    alphaQuality: lowEnd ? 0.8 : coarsePointer ? 0.7 : 1,
    saturation: lowEnd ? 42 : coarsePointer ? 34 : 58,
  };
}

function fadeInOut(t: number, m: number) {
  const hm = 0.5 * m;
  return Math.abs(((t + hm) % m) - hm) / hm;
}

function normalizeRgbChannels(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const normalized = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
    if (normalized.length !== 6) return fallback;
    const channels = [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ];
    if (channels.some((channel) => Number.isNaN(channel))) return fallback;
    return channels.join(",");
  }

  const match = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!match) return trimmed.replace(/\s+/g, ",");
  return match[1]
    .split(",")
    .slice(0, 3)
    .map((part) => part.trim())
    .join(",");
}

function getThemePalette() {
  if (typeof document === "undefined") {
    return { atmosphere: "10,9,8", accent: "201,169,97" };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    atmosphere: normalizeRgbChannels(styles.getPropertyValue("--atmosphere"), "10,9,8"),
    accent: normalizeRgbChannels(styles.getPropertyValue("--theme-accent"), "201,169,97"),
  };
}

function CssAurora() {
  return (
    <div className="aurora-shell absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <div className="aurora-haze aurora-haze-top" />
      <div className="aurora-haze aurora-haze-center" />
      <div className="aurora-haze aurora-haze-edge" />
      {cssRibbons.map((ribbon, index) => (
        <span
          key={index}
          className="aurora-ribbon"
          style={{
            left: ribbon.left,
            width: ribbon.width,
            opacity: ribbon.opacity,
            animationDelay: ribbon.delay,
            animationDuration: ribbon.duration,
          }}
        />
      ))}
    </div>
  );
}

export default function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const useCssFallback = useSyncExternalStore(subscribeToNothing, shouldUseCssFallback, () => false);
  const theme = useResolvedTheme();

  useEffect(() => {
    if (useCssFallback) return;

    const visible = canvasRef.current;
    if (!visible) return;
    const ctxB = visible.getContext("2d");
    if (!ctxB) return;

    const profile = getPerformanceProfile();
    const raysLayer = document.createElement("canvas");
    const staticLayer = document.createElement("canvas");
    const ctxA = raysLayer.getContext("2d");
    const ctxS = staticLayer.getContext("2d");
    if (!ctxA || !ctxS) return;

    const noise3D = createNoise3D();

    let w = Math.max(1, visible.offsetWidth);
    let h = Math.max(1, visible.offsetHeight);
    let baseRatio = 1;
    let effectRatio = 1;
    let rayCount = 0;
    let total = 0;
    let props = new Float32Array(0);
    let tick = 0;
    let raf = 0;
    let running = false;
    let heroVisible = true;
    let lastFrameTs = 0;
    const frameBudget = profile.targetFps > 0 ? 1000 / profile.targetFps : 1000 / 60;

    function rand(r: number) {
      return Math.random() * r;
    }

    const setCanvasResolution = () => {
      const dpr = window.devicePixelRatio || 1;
      baseRatio = Math.max(1, Math.min(dpr * profile.baseScale, 2));
      effectRatio = Math.max(0.72, Math.min(baseRatio * profile.dynamicScale, baseRatio));

      const pw = Math.max(1, Math.floor(w * baseRatio));
      const ph = Math.max(1, Math.floor(h * baseRatio));
      const ew = Math.max(1, Math.floor(w * effectRatio));
      const eh = Math.max(1, Math.floor(h * effectRatio));

      visible.width = pw;
      visible.height = ph;
      raysLayer.width = ew;
      raysLayer.height = eh;
      staticLayer.width = pw;
      staticLayer.height = ph;

      ctxB.setTransform(baseRatio, 0, 0, baseRatio, 0, 0);
      ctxA.setTransform(effectRatio, 0, 0, effectRatio, 0, 0);
      ctxS.setTransform(baseRatio, 0, 0, baseRatio, 0, 0);
    };

    const drawStaticBackground = () => {
      ctxS.clearRect(0, 0, w, h);
      const { atmosphere, accent } = getThemePalette();

      const bgGradient = ctxS.createLinearGradient(0, 0, 0, h);
      bgGradient.addColorStop(0, `rgba(${atmosphere},0.9)`);
      bgGradient.addColorStop(0.45, `rgba(${atmosphere},0.72)`);
      bgGradient.addColorStop(0.9, `rgba(${atmosphere},0.42)`);
      bgGradient.addColorStop(0.97, `rgba(${atmosphere},0.12)`);
      bgGradient.addColorStop(1, `rgba(${atmosphere},0)`);
      ctxS.fillStyle = bgGradient;
      ctxS.fillRect(0, 0, w, h);

      const focusGlow = ctxS.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w * 0.58, h * 0.72, 520));
      focusGlow.addColorStop(0, `rgba(${accent},0.04)`);
      focusGlow.addColorStop(0.24, `rgba(${accent},0.026)`);
      focusGlow.addColorStop(0.52, `rgba(${accent},0.012)`);
      focusGlow.addColorStop(0.78, `rgba(${accent},0.004)`);
      focusGlow.addColorStop(1, `rgba(${accent},0)`);
      ctxS.fillStyle = focusGlow;
      ctxS.fillRect(0, 0, w, h);

      const bottomVignette = ctxS.createLinearGradient(0, h * 0.72, 0, h);
      bottomVignette.addColorStop(0, `rgba(${atmosphere},0)`);
      bottomVignette.addColorStop(0.7, `rgba(${atmosphere},0.26)`);
      bottomVignette.addColorStop(1, `rgba(${atmosphere},0.56)`);
      ctxS.fillStyle = bottomVignette;
      ctxS.fillRect(0, 0, w, h);
    };

    const initRay = (i: number) => {
      const x = rand(w);
      const len = BASE_LEN + rand(RANGE_LEN);
      const yBase = h * 0.5 + NOISE_STRENGTH;
      const y2Base = yBase - len;
      const n = noise3D(x * X_OFF, yBase * Y_OFF, tick * Z_OFF) * NOISE_STRENGTH;
      const speed = (BASE_SPEED + rand(RANGE_SPEED)) * profile.speedQuality * (Math.round(rand(1)) ? 1 : -1);
      const hue = BASE_HUE + rand(RANGE_HUE);
      props.set([x, yBase + n, y2Base + n, 0, BASE_TTL + rand(RANGE_TTL), BASE_WIDTH + rand(RANGE_WIDTH), speed, hue], i);
    };

    const rebuildRays = () => {
      rayCount = Math.max(96, Math.floor(Math.min(RAY_COUNT, (w / 2.8) * profile.rayQuality)));
      total = rayCount * RAY_PROPS;
      props = new Float32Array(total);
      for (let i = 0; i < total; i += RAY_PROPS) initRay(i);
    };

    const drawRay = (i: number) => {
      const x = props[i];
      const y1 = props[i + 1];
      const y2 = props[i + 2];
      const life = props[i + 3];
      const ttl = props[i + 4];
      const width = props[i + 5];
      const hue = props[i + 7];
      const a = fadeInOut(life, ttl) * 0.44 * profile.alphaQuality;

      const gradient = ctxA.createLinearGradient(x, y1, x, y2);
      gradient.addColorStop(0, `hsla(${hue}, ${profile.saturation}%, 66%, 0)`);
      gradient.addColorStop(0.5, `hsla(${hue}, ${profile.saturation}%, 66%, ${a})`);
      gradient.addColorStop(1, `hsla(${hue}, ${profile.saturation}%, 66%, 0)`);

      ctxA.beginPath();
      ctxA.strokeStyle = gradient;
      ctxA.lineWidth = width;
      ctxA.moveTo(x, y1);
      ctxA.lineTo(x, y2);
      ctxA.stroke();
    };

    const updateRay = (i: number) => {
      drawRay(i);
      const oldX = props[i];
      const life = props[i + 3] + 1;
      props[i] = oldX + props[i + 6];
      props[i + 3] = life;
      if (oldX < -50 || oldX > w + 50 || life > props[i + 4]) {
        initRay(i);
      }
    };

    const drawFrame = (ts: number) => {
      if (!heroVisible || document.hidden) {
        running = false;
        return;
      }

      if (!profile.reducedMotion && ts - lastFrameTs < frameBudget) {
        raf = requestAnimationFrame(drawFrame);
        return;
      }
      lastFrameTs = ts;

      tick++;
      ctxA.clearRect(0, 0, w, h);
      ctxA.globalCompositeOperation = "lighter";
      for (let i = 0; i < total; i += RAY_PROPS) {
        updateRay(i);
      }
      ctxA.globalCompositeOperation = "source-over";

      ctxB.clearRect(0, 0, w, h);
      ctxB.drawImage(staticLayer, 0, 0, w, h);

      ctxB.save();
      ctxB.filter = `blur(${profile.mainBlur}px)`;
      ctxB.globalCompositeOperation = "lighter";
      ctxB.drawImage(raysLayer, 0, 0, w, h);
      ctxB.restore();

      ctxB.save();
      ctxB.globalAlpha = profile.bloomAlpha;
      ctxB.filter = `blur(${profile.bloomBlur}px)`;
      ctxB.globalCompositeOperation = "screen";
      ctxB.drawImage(raysLayer, 0, 0, w, h);
      ctxB.restore();

      if (profile.reducedMotion) {
        running = false;
        return;
      }

      raf = requestAnimationFrame(drawFrame);
      running = true;
    };

    const runIfNeeded = () => {
      if (running || document.hidden || !heroVisible) return;
      running = true;
      raf = requestAnimationFrame(drawFrame);
    };

    const onResize = () => {
      w = Math.max(1, visible.offsetWidth);
      h = Math.max(1, visible.offsetHeight);
      setCanvasResolution();
      drawStaticBackground();
      rebuildRays();
      drawFrame(performance.now());
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
        return;
      }
      runIfNeeded();
    };

    const heroEl = (visible.closest(".hero-noise") || document.querySelector(".hero-noise")) as Element | null;
    let heroObserver: IntersectionObserver | null = null;
    if (heroEl) {
      heroObserver = new IntersectionObserver(
        (entries) => {
          heroVisible = entries[0]?.isIntersecting ?? true;
          if (heroVisible) runIfNeeded();
        },
        { threshold: 0.06 }
      );
      heroObserver.observe(heroEl);
    }

    setCanvasResolution();
    drawStaticBackground();
    rebuildRays();
    if (profile.reducedMotion) {
      drawFrame(performance.now());
    } else {
      runIfNeeded();
    }

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(visible);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      heroObserver?.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [theme, useCssFallback]);

  if (useCssFallback) return <CssAurora />;

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
