"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createNoise3D } from "simplex-noise";
import { subscribeResolvedTheme } from "@/lib/theme-client";

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
const BASE_HUE = 186;
const RANGE_HUE = 44;
const LIGHT_HUE_BASE = 168;
const LIGHT_HUE_RANGE = 152;
const X_OFF = 0.0015;
const Y_OFF = 0.0015;
const Z_OFF = 0.0015;

const cssRibbons = [
  { left: "3%", width: "9%", opacity: 0.44, delay: "0s", duration: "18s", hue: 0 },
  { left: "14%", width: "7%", opacity: 0.24, delay: "-5s", duration: "22s", hue: 55 },
  { left: "24%", width: "11%", opacity: 0.3, delay: "-2s", duration: "20s", hue: 115 },
  { left: "38%", width: "8%", opacity: 0.2, delay: "-9s", duration: "24s", hue: -35 },
  { left: "49%", width: "12%", opacity: 0.27, delay: "-4s", duration: "19s", hue: 145 },
  { left: "64%", width: "8%", opacity: 0.18, delay: "-11s", duration: "25s", hue: 75 },
  { left: "74%", width: "12%", opacity: 0.31, delay: "-7s", duration: "21s", hue: -15 },
  { left: "89%", width: "8%", opacity: 0.36, delay: "-6s", duration: "18s", hue: 125 },
];

let cssFallbackCache: boolean | null = null;

function shouldUseCssFallback() {
  if (cssFallbackCache !== null) return cssFallbackCache;
  if (typeof window === "undefined" || typeof document === "undefined") {
    cssFallbackCache = false;
    return false;
  }
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) {
    cssFallbackCache = true;
    return true;
  }
  const supportsFilter = "filter" in probe;
  const supportsComposite = typeof probe.globalCompositeOperation === "string";
  cssFallbackCache = !supportsFilter || !supportsComposite;
  return cssFallbackCache;
}

function subscribeToNothing() {
  return () => {};
}

function supportsWorkerCanvas() {
  return (
    typeof Worker !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype
  );
}

function startWorkerRenderer(
  canvas: HTMLCanvasElement,
  profile: ReturnType<typeof getPerformanceProfile>,
  onFail: () => void
) {
  let worker: Worker;
  try {
    worker = new Worker("/aurora-worker.js");
  } catch {
    return null;
  }
  let offscreen: OffscreenCanvas;
  try {
    offscreen = canvas.transferControlToOffscreen();
  } catch {
    worker.terminate();
    return null;
  }
  canvas.dataset.auroraTransferred = "1";

  let stopped = false;
  let failed = false;
  let gotFrame = false;
  let monitorRaf = 0;
  let degradeLevel = 0;
  let frames = 0;
  let windowStart = performance.now();

  const cleanupSelf = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(watchdog);
    cancelAnimationFrame(monitorRaf);
    if (scrollPauseTimer !== null) clearTimeout(scrollPauseTimer);
    window.removeEventListener("scroll", onScrollPause);
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    unsubscribeTheme();
    worker.terminate();
  };

  const fail = () => {
    if (failed) return;
    failed = true;
    cleanupSelf();
    onFail();
  };

  const postTheme = () => {
    worker.postMessage({
      type: "theme",
      light: document.documentElement.classList.contains("light"),
      palette: getThemePalette(),
    });
  };

  worker.onerror = () => fail();
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; tick?: number };
    if (data?.type === "frame" && typeof data.tick === "number") {
      gotFrame = true;
      canvas.dataset.auroraFrame = String(data.tick);
    }
  };

  worker.postMessage(
    {
      type: "init",
      canvas: offscreen,
      width: Math.max(1, canvas.offsetWidth),
      height: Math.max(1, canvas.offsetHeight),
      dpr: window.devicePixelRatio || 1,
      light: document.documentElement.classList.contains("light"),
      palette: getThemePalette(),
      profile,
    },
    [offscreen]
  );

  const onResize = () => {
    worker.postMessage({
      type: "resize",
      width: Math.max(1, canvas.offsetWidth),
      height: Math.max(1, canvas.offsetHeight),
      dpr: window.devicePixelRatio || 1,
    });
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(canvas);

  const onVisibilityChange = () => {
    worker.postMessage({ type: "hidden", hidden: document.hidden });
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  let scrollPauseTimer: ReturnType<typeof setTimeout> | null = null;
  const onScrollPause = () => {
    worker.postMessage({ type: "paused", paused: true });
    if (scrollPauseTimer !== null) clearTimeout(scrollPauseTimer);
    scrollPauseTimer = setTimeout(() => {
      scrollPauseTimer = null;
      worker.postMessage({ type: "paused", paused: false });
    }, 200);
  };
  if (profile.coarsePointer) {
    window.addEventListener("scroll", onScrollPause, { passive: true });
  }

  const unsubscribeTheme = subscribeResolvedTheme(postTheme);

  const watchdog = setTimeout(() => {
    if (!gotFrame) fail();
  }, 2500);

  const monitor = (ts: number) => {
    if (stopped) return;
    frames += 1;
    const elapsed = ts - windowStart;
    if (elapsed >= 2500) {
      const fps = (frames * 1000) / elapsed;
      if (fps < 30 && degradeLevel < 2) {
        degradeLevel += 1;
        worker.postMessage({ type: "degrade", level: degradeLevel });
      }
      frames = 0;
      windowStart = ts;
    }
    monitorRaf = requestAnimationFrame(monitor);
  };
  monitorRaf = requestAnimationFrame(monitor);

  return cleanupSelf;
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
    baseScale: lowEnd ? 0.5 : coarsePointer ? 0.45 : 1,
    dynamicScale: lowEnd ? 0.55 : coarsePointer ? 0.4 : 0.96,
    targetFps: reducedMotion ? 0 : lowEnd ? 20 : coarsePointer ? 24 : 60,
    mainBlur: lowEnd ? 0 : coarsePointer ? 0 : 12,
    bloomBlur: lowEnd ? 16 : coarsePointer ? 18 : 20,
    bloomAlpha: lowEnd ? 0.22 : coarsePointer ? 0.16 : 0.26,
    rayQuality: lowEnd ? 0.62 : coarsePointer ? 0.35 : 1,
    speedQuality: lowEnd ? 0.82 : coarsePointer ? 0.9 : 1,
    alphaQuality: lowEnd ? 0.8 : coarsePointer ? 0.7 : 1,
    saturation: lowEnd ? 42 : coarsePointer ? 34 : 58,
  };
}

const LIGHT_SATURATION = 58;
const LIGHT_LUMINANCE = 66;
const LIGHT_MAIN_ALPHA = 0.6;
const LIGHT_BLOOM_ALPHA = 0.28;

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
  const source = match ? match[1] : trimmed;
  const channels = source.match(/-?\d*\.?\d+%?/g)?.slice(0, 3);
  if (channels?.length === 3) return channels.join(", ");
  return fallback;
}

function getThemePalette() {
  if (typeof document === "undefined") {
    return { atmosphere: "8,8,12", accent: "100,210,255" };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    atmosphere: normalizeRgbChannels(styles.getPropertyValue("--atmosphere"), "8,8,12"),
    accent: normalizeRgbChannels(styles.getPropertyValue("--theme-accent"), "100,210,255"),
  };
}

function CssAurora() {
  return (
    <div className="aurora-shell fixed inset-0 -z-10 h-full w-full pointer-events-none" aria-hidden="true">
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
            filter: `blur(32px) hue-rotate(${ribbon.hue}deg)`,
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

    let visible = canvasRef.current;
    if (!visible) return;
    if (visible.dataset.auroraTransferred === "1") {
      const fresh = visible.cloneNode(false) as HTMLCanvasElement;
      delete fresh.dataset.auroraTransferred;
      delete fresh.dataset.auroraFrame;
      visible.replaceWith(fresh);
      canvasRef.current = fresh;
      visible = fresh;
    }

    const profile = getPerformanceProfile();

    const startMain = (target: HTMLCanvasElement) => {
      const visible = target;
      let ctxB: CanvasRenderingContext2D | null = null;
      try {
        ctxB = visible.getContext("2d");
      } catch {
        return () => {};
      }
      if (!ctxB) return () => {};
    const raysLayer = document.createElement("canvas");
    const staticLayer = document.createElement("canvas");
    const bloomLayer = document.createElement("canvas");
    const ctxA = raysLayer.getContext("2d");
    const ctxS = staticLayer.getContext("2d");
    const ctxBloom = bloomLayer.getContext("2d");
    if (!ctxA || !ctxS || !ctxBloom) return () => {};

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
    let lastFrameTs = 0;
    let lightMode = document.documentElement.classList.contains("light");
    const frameBudget = profile.targetFps > 0 ? 1000 / profile.targetFps : 1000 / 60;
    const motionScale = profile.targetFps > 0 && profile.targetFps < 60 ? 60 / profile.targetFps : 1;

    function rand(r: number) {
      return Math.random() * r;
    }

    const setCanvasResolution = () => {
      const dpr = window.devicePixelRatio || 1;
      baseRatio = Math.max(1, Math.min(dpr * profile.baseScale, 2));
      effectRatio = Math.max(0.35, Math.min(baseRatio * profile.dynamicScale, baseRatio));

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
      bloomLayer.width = Math.max(1, Math.floor(ew * 0.5));
      bloomLayer.height = Math.max(1, Math.floor(eh * 0.5));

      ctxB.setTransform(baseRatio, 0, 0, baseRatio, 0, 0);
      ctxA.setTransform(effectRatio, 0, 0, effectRatio, 0, 0);
      ctxS.setTransform(baseRatio, 0, 0, baseRatio, 0, 0);
    };

    const drawStaticBackground = () => {
      ctxS.clearRect(0, 0, w, h);
      const { atmosphere, accent } = getThemePalette();

      const bgGradient = ctxS.createLinearGradient(0, 0, 0, h);
      if (lightMode) {
        bgGradient.addColorStop(0, `rgba(${atmosphere},0.5)`);
        bgGradient.addColorStop(0.45, `rgba(${atmosphere},0.3)`);
        bgGradient.addColorStop(0.9, `rgba(${atmosphere},0.12)`);
        bgGradient.addColorStop(0.97, `rgba(${atmosphere},0.04)`);
        bgGradient.addColorStop(1, `rgba(${atmosphere},0)`);
      } else {
        bgGradient.addColorStop(0, `rgba(${atmosphere},0.9)`);
        bgGradient.addColorStop(0.45, `rgba(${atmosphere},0.72)`);
        bgGradient.addColorStop(0.9, `rgba(${atmosphere},0.42)`);
        bgGradient.addColorStop(0.97, `rgba(${atmosphere},0.12)`);
        bgGradient.addColorStop(1, `rgba(${atmosphere},0)`);
      }
      ctxS.fillStyle = bgGradient;
      ctxS.fillRect(0, 0, w, h);

      const glowBoost = lightMode ? 1.2 : 1;
      const focusGlow = ctxS.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w * 0.58, h * 0.72, 520));
      focusGlow.addColorStop(0, `rgba(${accent},${0.04 * glowBoost})`);
      focusGlow.addColorStop(0.24, `rgba(${accent},${0.026 * glowBoost})`);
      focusGlow.addColorStop(0.52, `rgba(${accent},${0.012 * glowBoost})`);
      focusGlow.addColorStop(0.78, `rgba(${accent},${0.004 * glowBoost})`);
      focusGlow.addColorStop(1, `rgba(${accent},0)`);
      ctxS.fillStyle = focusGlow;
      ctxS.fillRect(0, 0, w, h);

      const bottomVignette = ctxS.createLinearGradient(0, h * 0.72, 0, h);
      bottomVignette.addColorStop(0, `rgba(${atmosphere},0)`);
      bottomVignette.addColorStop(0.7, `rgba(${atmosphere},${lightMode ? 0.12 : 0.26})`);
      bottomVignette.addColorStop(1, `rgba(${atmosphere},${lightMode ? 0.3 : 0.56})`);
      ctxS.fillStyle = bottomVignette;
      ctxS.fillRect(0, 0, w, h);
    };

    const initRay = (i: number) => {
      const x = rand(w);
      const len = BASE_LEN + rand(RANGE_LEN);
      const yBase = h * 0.5 + NOISE_STRENGTH;
      const y2Base = yBase - len;
      const n = noise3D(x * X_OFF, yBase * Y_OFF, tick * Z_OFF) * NOISE_STRENGTH;
      const speed = (BASE_SPEED + rand(RANGE_SPEED)) * profile.speedQuality * motionScale * (Math.round(rand(1)) ? 1 : -1);
      const hueBase = lightMode ? LIGHT_HUE_BASE : BASE_HUE;
      const hueRange = lightMode ? LIGHT_HUE_RANGE : RANGE_HUE;
      const hue = hueBase + rand(hueRange);
      const rayWidth = lightMode
        ? (BASE_WIDTH + rand(RANGE_WIDTH)) * 2.1
        : BASE_WIDTH + rand(RANGE_WIDTH);
      props.set([x, yBase + n, y2Base + n, 0, (BASE_TTL + rand(RANGE_TTL)) / motionScale, rayWidth, speed, hue], i);
    };

    const rebuildRays = () => {
      const densityQuality = lightMode ? 1 : profile.rayQuality;
      rayCount = Math.max(96, Math.floor(Math.min(RAY_COUNT, (w / 2.8) * densityQuality)));
      total = rayCount * RAY_PROPS;
      props = new Float32Array(total);
      for (let i = 0; i < total; i += RAY_PROPS) initRay(i);
    };

    const HUE_BUCKETS = 8;
    const raySprites: Array<HTMLCanvasElement | null> = new Array(HUE_BUCKETS).fill(null);
    const getRaySprite = (hue: number) => {
      const hueBase = lightMode ? LIGHT_HUE_BASE : BASE_HUE;
      const hueRange = lightMode ? LIGHT_HUE_RANGE : RANGE_HUE;
      const bucket = Math.max(0, Math.min(HUE_BUCKETS - 1, Math.floor(((hue - hueBase) / hueRange) * HUE_BUCKETS)));
      const cached = raySprites[bucket];
      if (cached) return cached;
      const bucketHue = hueBase + ((bucket + 0.5) / HUE_BUCKETS) * hueRange;
      const sat = lightMode ? LIGHT_SATURATION : profile.saturation;
      const lum = lightMode ? LIGHT_LUMINANCE : 66;
      const sprite = document.createElement("canvas");
      sprite.width = 1;
      sprite.height = 256;
      const sctx = sprite.getContext("2d");
      if (sctx) {
        const g = sctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, `hsla(${bucketHue}, ${sat}%, ${lum}%, 0)`);
        g.addColorStop(0.5, `hsla(${bucketHue}, ${sat}%, ${lum}%, 1)`);
        g.addColorStop(1, `hsla(${bucketHue}, ${sat}%, ${lum}%, 0)`);
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, 1, 256);
      }
      raySprites[bucket] = sprite;
      return sprite;
    };

    const drawRay = (i: number) => {
      const x = props[i];
      const y1 = props[i + 1];
      const y2 = props[i + 2];
      const life = props[i + 3];
      const ttl = props[i + 4];
      const width = props[i + 5];
      const hue = props[i + 7];
      const a = fadeInOut(life, ttl) * 0.44 * (lightMode ? 1 : profile.alphaQuality);

      ctxA.globalAlpha = a;
      ctxA.drawImage(getRaySprite(hue), x - width / 2, y2, width, Math.max(1, y1 - y2));
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

    const composeFrame = () => {
      ctxB.clearRect(0, 0, w, h);
      ctxB.drawImage(staticLayer, 0, 0, w, h);

      ctxB.save();
      if (profile.mainBlur > 0) ctxB.filter = `blur(${profile.mainBlur}px)`;
      ctxB.globalCompositeOperation = lightMode ? "multiply" : "lighter";
      if (lightMode) ctxB.globalAlpha = LIGHT_MAIN_ALPHA;
      ctxB.drawImage(raysLayer, 0, 0, w, h);
      ctxB.restore();

      ctxBloom.clearRect(0, 0, bloomLayer.width, bloomLayer.height);
      ctxBloom.filter = `blur(${Math.max(2, profile.bloomBlur * 0.5)}px)`;
      ctxBloom.drawImage(raysLayer, 0, 0, bloomLayer.width, bloomLayer.height);
      ctxBloom.filter = "none";

      ctxB.save();
      ctxB.globalAlpha = lightMode ? LIGHT_BLOOM_ALPHA : profile.bloomAlpha;
      ctxB.globalCompositeOperation = lightMode ? "multiply" : "screen";
      ctxB.drawImage(bloomLayer, 0, 0, w, h);
      ctxB.restore();
    };

    const drawFrame = (ts: number) => {
      if (document.hidden) {
        running = false;
        return;
      }

      if (!profile.reducedMotion && ts - lastFrameTs < frameBudget) {
        raf = requestAnimationFrame(drawFrame);
        return;
      }
      lastFrameTs = ts;

      tick += motionScale;
      ctxA.clearRect(0, 0, w, h);
      ctxA.globalCompositeOperation = lightMode ? "source-over" : "lighter";
      for (let i = 0; i < total; i += RAY_PROPS) {
        updateRay(i);
      }
      ctxA.globalCompositeOperation = "source-over";
      ctxA.globalAlpha = 1;
      composeFrame();

      if (profile.reducedMotion) {
        running = false;
        return;
      }

      raf = requestAnimationFrame(drawFrame);
      running = true;
    };

    const runIfNeeded = () => {
      if (running || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(drawFrame);
    };

    let scrollPaused = false;
    let scrollResumeTimer: ReturnType<typeof setTimeout> | null = null;
    const onScrollPause = () => {
      if (!scrollPaused) {
        scrollPaused = true;
        cancelAnimationFrame(raf);
        running = false;
      }
      if (scrollResumeTimer !== null) clearTimeout(scrollResumeTimer);
      scrollResumeTimer = setTimeout(() => {
        scrollResumeTimer = null;
        scrollPaused = false;
        runIfNeeded();
      }, 200);
    };

    const onResize = () => {
      const nextW = Math.max(1, visible.offsetWidth);
      const nextH = Math.max(1, visible.offsetHeight);
      if (nextW === w && nextH === h) return;
      w = nextW;
      h = nextH;
      setCanvasResolution();
      drawStaticBackground();
      rebuildRays();
      runIfNeeded();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
        return;
      }
      runIfNeeded();
    };

    const onThemeChange = () => {
      lightMode = document.documentElement.classList.contains("light");
      raySprites.fill(null);
      drawStaticBackground();
      composeFrame();
    };

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
    const unsubscribeTheme = subscribeResolvedTheme(onThemeChange);
    if (profile.coarsePointer && !profile.reducedMotion) {
      window.addEventListener("scroll", onScrollPause, { passive: true });
    }

    return () => {
      cancelAnimationFrame(raf);
      if (scrollResumeTimer !== null) clearTimeout(scrollResumeTimer);
      window.removeEventListener("scroll", onScrollPause);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribeTheme();
    };
    };

    if (profile.coarsePointer && supportsWorkerCanvas()) {
      let fallbackCleanup: (() => void) | null = null;
      const workerCleanup = startWorkerRenderer(visible, profile, () => {
        const fresh = visible.cloneNode(false) as HTMLCanvasElement;
        delete fresh.dataset.auroraTransferred;
        delete fresh.dataset.auroraFrame;
        visible.replaceWith(fresh);
        canvasRef.current = fresh;
        fallbackCleanup = startMain(fresh);
      });
      if (workerCleanup) {
        return () => {
          workerCleanup();
          fallbackCleanup?.();
        };
      }
    }

    return startMain(visible);
  }, [useCssFallback]);

  if (useCssFallback) return <CssAurora />;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 h-full w-full pointer-events-none"
      style={{ height: "100lvh" }}
    />
  );
}
