"use client";
import { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise";

const RAY_COUNT = 500;
const RAY_PROPS = 8;
const BASE_LEN = 200;
const RANGE_LEN = 250;
const BASE_SPEED = 0.015;
const RANGE_SPEED = 0.07;
const BASE_WIDTH = 5;
const RANGE_WIDTH = 14;
const BASE_TTL = 35;
const RANGE_TTL = 90;
const X_OFF = 0.001;
const Y_OFF = 0.001;
const Z_OFF = 0.001;

const COLORS = [
  [201, 169, 97],  // gold
  [188, 145, 68],  // bronze
  [218, 185, 125], // pale gold
  [170, 130, 55],  // deep amber
];

export default function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const visible = canvasRef.current;
    if (!visible) return;
    const ctxB = visible.getContext("2d");
    if (!ctxB) return;

    const offscreen = document.createElement("canvas");
    const ctxA = offscreen.getContext("2d");
    if (!ctxA) return;

    let w = visible.width = visible.offsetWidth;
    let h = visible.height = visible.offsetHeight;
    let rayCount = Math.min(RAY_COUNT, Math.floor(w / 2.8));
    offscreen.width = w;
    offscreen.height = h;

    const noise3D = createNoise3D();
    let total = rayCount * RAY_PROPS;
    let props = new Float32Array(total);
    let tick = 0;

    function rand(r: number) { return Math.random() * r; }

    function initRay(i: number) {
      const x = rand(w);
      const mid = h * 0.48;
      const len = BASE_LEN + rand(RANGE_LEN);
      const y1 = mid + 80 + rand(40);
      const y2 = y1 - len - rand(80);
      const n = noise3D(x * X_OFF, y1 * Y_OFF, tick * Z_OFF) * 100;
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
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.55})`);
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
      tick++;
      ctxA.clearRect(0, 0, w, h);

      ctxB.save();
      ctxB.globalCompositeOperation = "source-over";
      const bgGradient = ctxB.createLinearGradient(0, 0, 0, h);
      bgGradient.addColorStop(0, "#0a0908");
      bgGradient.addColorStop(0.55, "#0a0908");
      bgGradient.addColorStop(0.75, "rgba(10,9,8,0.8)");
      bgGradient.addColorStop(1, "rgba(10,9,8,0)");
      ctxB.fillStyle = bgGradient;
      ctxB.fillRect(0, 0, w, h);
      ctxB.restore();

      for (let i = 0; i < total; i += RAY_PROPS) updateRay(i);

      ctxB.save();
      ctxB.filter = "blur(18px)";
      ctxB.globalCompositeOperation = "lighter";
      ctxB.drawImage(offscreen, 0, 0);
      ctxB.restore();

      raf = requestAnimationFrame(draw);
    };

    let raf = requestAnimationFrame(draw);

    const onResize = () => {
      w = visible.width = visible.offsetWidth;
      h = visible.height = visible.offsetHeight;
      offscreen.width = w;
      offscreen.height = h;
      rebuild();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(visible);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
