"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createNoise3D } from "simplex-noise";

const RAY_COUNT = 280;
const RAY_PROPS = 8;
const BASE_LEN = 260;
const RANGE_LEN = 210;
const BASE_SPEED = 0.008;
const RANGE_SPEED = 0.04;
const BASE_WIDTH = 8;
const RANGE_WIDTH = 18;
const BASE_TTL = 90;
const RANGE_TTL = 120;
const X_OFF = 0.0009;
const Y_OFF = 0.0007;
const Z_OFF = 0.0007;

const COLORS = [
  [208, 171, 101],
  [199, 163, 96],
  [186, 149, 87],
  [172, 137, 79],
];

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
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|Edg|OPR|Firefox)/i.test(ua);
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
    baseScale: lowEnd ? 0.9 : coarsePointer ? 0.96 : 1,
    dynamicScale: lowEnd ? 0.62 : coarsePointer ? 0.74 : 0.88,
    targetFps: reducedMotion ? 0 : lowEnd ? 30 : coarsePointer ? 45 : 60,
    firstBlur: lowEnd ? 18 : coarsePointer ? 22 : 24,
    secondBlur: lowEnd ? 34 : coarsePointer ? 40 : 48,
    secondAlpha: lowEnd ? 0.48 : coarsePointer ? 0.54 : 0.58,
    rayQuality: lowEnd ? 0.78 : coarsePointer ? 0.9 : 1,
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

      const bgGradient = ctxS.createLinearGradient(0, 0, 0, h);
      bgGradient.addColorStop(0, "rgba(10,9,8,0.9)");
      bgGradient.addColorStop(0.45, "rgba(10,9,8,0.72)");
      bgGradient.addColorStop(0.9, "rgba(10,9,8,0.42)");
      bgGradient.addColorStop(0.97, "rgba(10,9,8,0.12)");
      bgGradient.addColorStop(1, "rgba(10,9,8,0)");
      ctxS.fillStyle = bgGradient;
      ctxS.fillRect(0, 0, w, h);

      const focusGlow = ctxS.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.44, Math.max(w * 0.3, 280));
      focusGlow.addColorStop(0, "rgba(201,169,97,0.09)");
      focusGlow.addColorStop(0.45, "rgba(201,169,97,0.028)");
      focusGlow.addColorStop(1, "rgba(201,169,97,0)");
      ctxS.fillStyle = focusGlow;
      ctxS.fillRect(0, 0, w, h);

      const bottomVignette = ctxS.createLinearGradient(0, h * 0.72, 0, h);
      bottomVignette.addColorStop(0, "rgba(10,9,8,0)");
      bottomVignette.addColorStop(0.7, "rgba(10,9,8,0.26)");
      bottomVignette.addColorStop(1, "rgba(10,9,8,0.56)");
      ctxS.fillStyle = bottomVignette;
      ctxS.fillRect(0, 0, w, h);
    };

    const initRay = (i: number) => {
      const x = rand(w);
      const mid = h * 0.52;
      const len = BASE_LEN + rand(RANGE_LEN);
      const y1 = mid + 60 + rand(42);
      const y2 = y1 - len - rand(90);
      const n = noise3D(x * X_OFF, y1 * Y_OFF, tick * Z_OFF) * 72;
      const speed = BASE_SPEED + rand(RANGE_SPEED) * (Math.round(rand(1)) ? 1 : -1);
      const colorIdx = Math.floor(rand(COLORS.length));
      props.set([x, y1 + n, y2 + n, 0, BASE_TTL + rand(RANGE_TTL), BASE_WIDTH + rand(RANGE_WIDTH), speed, colorIdx], i);
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
      const colorIdx = props[i + 7];
      const [r, g, b] = COLORS[colorIdx] ?? COLORS[0];
      const a = Math.sin((life / ttl) * Math.PI);

      const gradient = ctxA.createLinearGradient(x, y1, x, y2);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.42})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

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
      for (let i = 0; i < total; i += RAY_PROPS) {
        updateRay(i);
      }

      ctxB.clearRect(0, 0, w, h);
      ctxB.drawImage(staticLayer, 0, 0, w, h);

      ctxB.save();
      ctxB.filter = `blur(${profile.firstBlur}px)`;
      ctxB.globalCompositeOperation = "screen";
      ctxB.drawImage(raysLayer, 0, 0, w, h);
      ctxB.restore();

      ctxB.save();
      ctxB.globalAlpha = profile.secondAlpha;
      ctxB.filter = `blur(${profile.secondBlur}px)`;
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
  }, [useCssFallback]);

  if (useCssFallback) return <CssAurora />;

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
