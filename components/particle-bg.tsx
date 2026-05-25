"use client";

import { useEffect, useRef } from "react";

const ACCENT = "201, 169, 97";
const VP_Y_RATIO = 0.38;
const RIPPLE_LIFETIME = 560;
const TAP_RING_MAX = 220;

interface Ripple {
  x: number;
  y: number;
  birth: number;
}

function getPerformanceProfile() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory) ?? 4;

  const lowEnd = coarsePointer && (cores <= 4 || memory <= 4);
  const renderScale = lowEnd ? 0.78 : coarsePointer ? 0.9 : 1;
  const targetFps = reducedMotion ? 0 : lowEnd ? 30 : coarsePointer ? 45 : 60;

  return { reducedMotion, finePointer, coarsePointer, lowEnd, renderScale, targetFps };
}

export default function BgCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const profile = getPerformanceProfile();

    const staticLayer = document.createElement("canvas");
    const staticCtx = staticLayer.getContext("2d");
    if (!staticCtx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let ratio = 1;

    const mouse = { x: w / 2, y: h * 0.54 };
    const focus = { x: w / 2, y: h * 0.54 };
    const target = { x: w / 2, y: h * 0.54 };
    const ripples: Ripple[] = [];

    let raf = 0;
    let running = false;
    let heroVisible = true;
    let lastFrameTs = 0;
    const frameBudget = profile.targetFps > 0 ? 1000 / profile.targetFps : 1000 / 60;

    const setCanvasResolution = () => {
      ratio = Math.max(1, Math.min((window.devicePixelRatio || 1) * profile.renderScale, 2));
      const pw = Math.max(1, Math.floor(w * ratio));
      const ph = Math.max(1, Math.floor(h * ratio));

      canvas.width = pw;
      canvas.height = ph;
      staticLayer.width = pw;
      staticLayer.height = ph;

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      staticCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const drawStaticLayer = () => {
      staticCtx.clearRect(0, 0, w, h);
      const vpX = w / 2;
      const vpY = h * VP_Y_RATIO;
      const vLines = profile.lowEnd ? 18 : profile.coarsePointer ? 21 : 24;
      const hLines = profile.lowEnd ? 11 : profile.coarsePointer ? 13 : 16;

      for (let i = 0; i <= vLines; i++) {
        const t = i / vLines;
        const x0 = w * t;
        const x1 = vpX + (x0 - vpX) * 3;
        staticCtx.beginPath();
        staticCtx.moveTo(x0, h);
        staticCtx.lineTo(x1, vpY);
        staticCtx.strokeStyle = `rgba(${ACCENT},${0.024 + 0.018 * Math.abs(t - 0.5) * 2})`;
        staticCtx.lineWidth = profile.lowEnd ? 0.42 : 0.5;
        staticCtx.stroke();
      }

      for (let i = 0; i <= hLines; i++) {
        const t = i / hLines;
        const y = h - (h - vpY) * Math.pow(t, 1.6);
        staticCtx.beginPath();
        staticCtx.moveTo(0, y);
        staticCtx.lineTo(w, y);
        staticCtx.strokeStyle = `rgba(${ACCENT},${0.012 + 0.018 * t * t})`;
        staticCtx.lineWidth = profile.lowEnd ? 0.42 : 0.5;
        staticCtx.stroke();
      }
    };

    const drawDynamicGlow = (ts: number) => {
      if (!profile.finePointer) {
        target.x = w * 0.5 + Math.sin(ts * 0.00038) * w * 0.12;
        target.y = h * 0.55 + Math.cos(ts * 0.00031) * h * 0.07;
      }

      focus.x += (target.x - focus.x) * 0.12;
      focus.y += (target.y - focus.y) * 0.12;

      const radius = profile.lowEnd ? 250 : profile.coarsePointer ? 280 : 320;
      const offset = profile.lowEnd ? 2.8 : 4;
      const channels = [
        { x: focus.x - offset, y: focus.y, rgb: "255, 169, 97" },
        { x: focus.x, y: focus.y, rgb: "201, 255, 97" },
        { x: focus.x + offset, y: focus.y, rgb: "201, 169, 255" },
      ];

      for (const item of channels) {
        const g = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, radius);
        g.addColorStop(0, `rgba(${item.rgb},${profile.lowEnd ? 0.024 : 0.03})`);
        g.addColorStop(0.5, `rgba(${item.rgb},${profile.lowEnd ? 0.006 : 0.008})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawRipples = (ts: number) => {
      if (!profile.coarsePointer || ripples.length === 0) return false;
      let hasActive = false;

      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        const p = (ts - ripple.birth) / RIPPLE_LIFETIME;
        if (p >= 1) {
          ripples.splice(i, 1);
          continue;
        }

        hasActive = true;
        const eased = 1 - Math.pow(1 - p, 2);
        const radius = 24 + TAP_RING_MAX * eased;
        const alpha = (1 - p) * 0.24;

        const halo = ctx.createRadialGradient(ripple.x, ripple.y, 0, ripple.x, ripple.y, radius * 1.2);
        halo.addColorStop(0, `rgba(${ACCENT},${alpha * 0.42})`);
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);

        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ACCENT},${alpha})`;
        ctx.lineWidth = 1.4 + (1 - p) * 2;
        ctx.stroke();
      }

      return hasActive;
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

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(staticLayer, 0, 0, w, h);
      drawDynamicGlow(ts);
      const hasRipple = drawRipples(ts);

      if (profile.reducedMotion && !hasRipple) {
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

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      target.x = mouse.x;
      target.y = mouse.y;
      runIfNeeded();
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      target.x = touch.clientX;
      target.y = touch.clientY;
      if (profile.coarsePointer) {
        ripples.push({ x: touch.clientX, y: touch.clientY, birth: performance.now() });
      }
      runIfNeeded();
    };

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      setCanvasResolution();
      drawStaticLayer();
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

    const heroEl = document.querySelector(".hero-noise");
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
    drawStaticLayer();
    if (!profile.reducedMotion) {
      runIfNeeded();
    } else {
      drawFrame(performance.now());
    }

    if (profile.finePointer) {
      window.addEventListener("mousemove", onMove, { passive: true });
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      heroObserver?.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }} />;
}
