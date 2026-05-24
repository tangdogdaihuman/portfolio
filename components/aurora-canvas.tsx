"use client";

import { useEffect, useRef } from "react";
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
  const useCssFallback = shouldUseCssFallback();

  useEffect(() => {
    if (useCssFallback) return;

    const visible = canvasRef.current;
    if (!visible) return;
    const ctxB = visible.getContext("2d");
    if (!ctxB) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const offscreen = document.createElement("canvas");
    const ctxA = offscreen.getContext("2d");
    if (!ctxA) return;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    let w = Math.max(1, visible.offsetWidth);
    let h = Math.max(1, visible.offsetHeight);
    let rayCount = Math.min(RAY_COUNT, Math.floor(w / 2.8));
    visible.width = Math.floor(w * dpr);
    visible.height = Math.floor(h * dpr);
    offscreen.width = Math.floor(w * dpr);
    offscreen.height = Math.floor(h * dpr);
    ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);

    const noise3D = createNoise3D();
    let total = rayCount * RAY_PROPS;
    let props = new Float32Array(total);
    let tick = 0;

    function rand(r: number) { return Math.random() * r; }

    function initRay(i: number) {
      const x = rand(w);
      const mid = h * 0.52;
      const len = BASE_LEN + rand(RANGE_LEN);
      const y1 = mid + 60 + rand(42);
      const y2 = y1 - len - rand(90);
      const n = noise3D(x * X_OFF, y1 * Y_OFF, tick * Z_OFF) * 72;
      const speed = BASE_SPEED + rand(RANGE_SPEED) * (Math.round(rand(1)) ? 1 : -1);
      const colorIdx = Math.floor(rand(COLORS.length));
      props.set([x, y1 + n, y2 + n, 0, BASE_TTL + rand(RANGE_TTL), BASE_WIDTH + rand(RANGE_WIDTH), speed, colorIdx], i);
    }

    function rebuild() {
      rayCount = Math.min(RAY_COUNT, Math.floor(w / 2.8));
      total = rayCount * RAY_PROPS;
      props = new Float32Array(total);
      for (let i = 0; i < total; i += RAY_PROPS) initRay(i);
    }
    rebuild();

    function fadeInOut(life: number, ttl: number) {
      return Math.sin((life / ttl) * Math.PI);
    }

    function drawRay(i: number) {
      const x = props[i], y1 = props[i + 1], y2 = props[i + 2];
      const life = props[i + 3], ttl = props[i + 4], width = props[i + 5];
      const colorIdx = props[i + 7];
      const [r, g, b] = COLORS[colorIdx] ?? COLORS[0];
      const a = fadeInOut(life, ttl);

      const gradient = ctxA!.createLinearGradient(x, y1, x, y2);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.42})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctxA!.beginPath();
      ctxA!.strokeStyle = gradient;
      ctxA!.lineWidth = width;
      ctxA!.moveTo(x, y1);
      ctxA!.lineTo(x, y2);
      ctxA!.stroke();
    }

    function updateRay(i: number) {
      drawRay(i);
      const oldX = props[i];
      const life = props[i + 3] + 1;
      props[i] = oldX + props[i + 6];
      props[i + 3] = life;
      if (oldX < -50 || oldX > w + 50 || life > props[i + 4]) initRay(i);
    }

    const draw = () => {
      if (w <= 0 || h <= 0) return;
      tick++;
      ctxA.clearRect(0, 0, w, h);

      ctxB.save();
      ctxB.globalCompositeOperation = "source-over";
      const bgGradient = ctxB.createLinearGradient(0, 0, 0, h);
      bgGradient.addColorStop(0, "rgba(10,9,8,0.9)");
      bgGradient.addColorStop(0.45, "rgba(10,9,8,0.72)");
      bgGradient.addColorStop(0.9, "rgba(10,9,8,0.42)");
      bgGradient.addColorStop(0.97, "rgba(10,9,8,0.12)");
      bgGradient.addColorStop(1, "rgba(10,9,8,0)");
      ctxB.fillStyle = bgGradient;
      ctxB.fillRect(0, 0, w, h);

      const focusGlow = ctxB.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.44, Math.max(w * 0.3, 280));
      focusGlow.addColorStop(0, "rgba(201,169,97,0.09)");
      focusGlow.addColorStop(0.45, "rgba(201,169,97,0.028)");
      focusGlow.addColorStop(1, "rgba(201,169,97,0)");
      ctxB.fillStyle = focusGlow;
      ctxB.fillRect(0, 0, w, h);

      const bottomVignette = ctxB.createLinearGradient(0, h * 0.72, 0, h);
      bottomVignette.addColorStop(0, "rgba(10,9,8,0)");
      bottomVignette.addColorStop(0.7, "rgba(10,9,8,0.26)");
      bottomVignette.addColorStop(1, "rgba(10,9,8,0.56)");
      ctxB.fillStyle = bottomVignette;
      ctxB.fillRect(0, 0, w, h);
      ctxB.restore();

      for (let i = 0; i < total; i += RAY_PROPS) updateRay(i);

      ctxB.save();
      ctxB.filter = "blur(24px)";
      ctxB.globalCompositeOperation = "screen";
      ctxB.drawImage(offscreen, 0, 0, w, h);
      ctxB.restore();

      ctxB.save();
      ctxB.globalAlpha = 0.58;
      ctxB.filter = "blur(48px)";
      ctxB.globalCompositeOperation = "screen";
      ctxB.drawImage(offscreen, 0, 0, w, h);
      ctxB.restore();

      if (!reducedMotion && !document.hidden) {
        raf = requestAnimationFrame(draw);
      }
    };

    let raf = requestAnimationFrame(draw);

    const onResize = () => {
      w = Math.max(1, visible.offsetWidth);
      h = Math.max(1, visible.offsetHeight);
      visible.width = Math.floor(w * dpr);
      visible.height = Math.floor(h * dpr);
      offscreen.width = Math.floor(w * dpr);
      offscreen.height = Math.floor(h * dpr);
      ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      draw();
    };
    const onVisibilityChange = () => {
      if (reducedMotion) return;
      if (document.hidden) {
        cancelAnimationFrame(raf);
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(visible);
    if (reducedMotion) {
      cancelAnimationFrame(raf);
      draw();
    } else {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [useCssFallback]);

  if (useCssFallback) return <CssAurora />;

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
