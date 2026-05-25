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

export default function BgCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const dynamicScene = finePointer && !reducedMotion;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const mouse = { x: w / 2, y: h / 2 };
    const ripples: Ripple[] = [];
    let raf = 0;
    let running = false;

    const drawGrid = () => {
      const vpX = w / 2;
      const vpY = h * VP_Y_RATIO;
      const vLines = finePointer ? 24 : 14;
      const hLines = finePointer ? 16 : 10;

      for (let i = 0; i <= vLines; i++) {
        const t = i / vLines;
        const x0 = w * t;
        const x1 = vpX + (x0 - vpX) * 3;
        ctx.beginPath();
        ctx.moveTo(x0, h);
        ctx.lineTo(x1, vpY);
        ctx.strokeStyle = `rgba(${ACCENT},${finePointer ? 0.03 : 0.02 + 0.018 * Math.abs(t - 0.5) * 2})`;
        ctx.lineWidth = finePointer ? 0.5 : 0.42;
        ctx.stroke();
      }

      for (let i = 0; i <= hLines; i++) {
        const t = i / hLines;
        const y = h - (h - vpY) * Math.pow(t, 1.6);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.strokeStyle = `rgba(${ACCENT},${finePointer ? 0.015 + 0.02 * t * t : 0.012 + 0.012 * t * t})`;
        ctx.lineWidth = finePointer ? 0.5 : 0.42;
        ctx.stroke();
      }
    };

    const drawGlow = () => {
      if (finePointer) {
        const offset = 4;
        const radius = 300;
        const colors = [
          { x: mouse.x - offset, y: mouse.y, channel: "255, 169, 97" },
          { x: mouse.x, y: mouse.y, channel: "201, 255, 97" },
          { x: mouse.x + offset, y: mouse.y, channel: "201, 169, 255" },
        ];
        for (const c of colors) {
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
          g.addColorStop(0, `rgba(${c.channel},0.03)`);
          g.addColorStop(0.5, `rgba(${c.channel},0.008)`);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
        return;
      }

      const glowRadius = Math.min(Math.max(w * 0.32, 220), 460);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.54, 0, w * 0.5, h * 0.54, glowRadius);
      g.addColorStop(0, `rgba(${ACCENT},0.042)`);
      g.addColorStop(0.4, `rgba(${ACCENT},0.016)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const drawRipples = (now: number) => {
      if (!coarsePointer || ripples.length === 0) return false;
      let hasActive = false;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        const p = (now - ripple.birth) / RIPPLE_LIFETIME;
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

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      drawGlow();
      const hasActiveRipples = drawRipples(now);

      if (!document.hidden && (dynamicScene || hasActiveRipples)) {
        raf = requestAnimationFrame(draw);
        running = true;
      } else {
        running = false;
      }
    };

    const runIfNeeded = () => {
      if (running || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (dynamicScene) runIfNeeded();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!coarsePointer) return;
      const touch = e.touches[0];
      if (!touch) return;
      ripples.push({
        x: touch.clientX,
        y: touch.clientY,
        birth: performance.now(),
      });
      runIfNeeded();
    };

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      draw(performance.now());
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
        return;
      }
      if (dynamicScene || ripples.length > 0) runIfNeeded();
    };

    if (dynamicScene) {
      runIfNeeded();
      window.addEventListener("mousemove", onMove, { passive: true });
    } else {
      draw(performance.now());
    }
    if (coarsePointer) {
      window.addEventListener("touchstart", onTouchStart, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }} />;
}
