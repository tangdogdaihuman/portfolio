"use client";
import { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise";

const BASE_RAY_COUNT = 500;
const RAY_PROPS = 8;
const BASE_LENGTH = 200;
const RANGE_LENGTH = 200;
const BASE_SPEED = 0.05;
const RANGE_SPEED = 0.1;
const BASE_WIDTH = 10;
const RANGE_WIDTH = 20;
const BASE_TTL = 50;
const RANGE_TTL = 100;
const NOISE_STRENGTH = 100;
const X_OFF = 0.0015;
const Y_OFF = 0.0015;
const Z_OFF = 0.0015;

const COLORS = [
  [210, 175, 92],
  [196, 155, 74],
  [230, 198, 132],
  [169, 128, 53],
] as const;

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
    offscreen.width = w;
    offscreen.height = h;

    const noise3D = createNoise3D();
    let rayCount = Math.min(BASE_RAY_COUNT, Math.max(180, Math.floor(w * 0.55)));
    let total = rayCount * RAY_PROPS;
    let props = new Float32Array(total);
    let tick = 0;
    let centerY = h * 0.5;

    function rand(range: number) {
      return Math.random() * range;
    }

    function fadeInOut(life: number, ttl: number) {
      return Math.sin((life / ttl) * Math.PI);
    }

    function initRay(i: number) {
      const length = BASE_LENGTH + rand(RANGE_LENGTH);
      const x = rand(w);
      const y1Base = centerY + NOISE_STRENGTH;
      const y2Base = y1Base - length;
      const n = noise3D(x * X_OFF, y1Base * Y_OFF, tick * Z_OFF) * NOISE_STRENGTH;
      const ttl = BASE_TTL + rand(RANGE_TTL);
      const width = BASE_WIDTH + rand(RANGE_WIDTH);
      const speed = BASE_SPEED + rand(RANGE_SPEED) * (Math.random() > 0.5 ? 1 : -1);
      const color = Math.floor(rand(COLORS.length));
      props.set([x, y1Base + n, y2Base + n, 0, ttl, width, speed, color], i);
    }

    function rebuild() {
      rayCount = Math.min(BASE_RAY_COUNT, Math.max(180, Math.floor(w * 0.55)));
      total = rayCount * RAY_PROPS;
      props = new Float32Array(total);
      centerY = h * 0.5;
      for (let i = 0; i < total; i += RAY_PROPS) initRay(i);
    }
    rebuild();

    function drawRay(i: number) {
      const x = props[i];
      const y1 = props[i + 1];
      const y2 = props[i + 2];
      const life = props[i + 3];
      const ttl = props[i + 4];
      const width = props[i + 5];
      const colorIdx = props[i + 7];
      const [r, g, b] = COLORS[colorIdx] ?? COLORS[0];
      const alpha = fadeInOut(life, ttl);

      const gradient = ctxA.createLinearGradient(x, y1, x, y2);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.62})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctxA.beginPath();
      ctxA.strokeStyle = gradient;
      ctxA.lineWidth = width;
      ctxA.moveTo(x, y1);
      ctxA.lineTo(x, y2);
      ctxA.stroke();
    }

    function updateRay(i: number) {
      drawRay(i);
      props[i] += props[i + 6];
      props[i + 3] += 1;
      if (props[i] < -60 || props[i] > w + 60 || props[i + 3] > props[i + 4]) initRay(i);
    }

    let raf = 0;
    const draw = () => {
      tick += 1;
      ctxA.clearRect(0, 0, w, h);
      ctxB.clearRect(0, 0, w, h);

      const bg = ctxB.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(10,9,8,0.78)");
      bg.addColorStop(0.88, "rgba(10,9,8,0.48)");
      bg.addColorStop(0.95, "rgba(10,9,8,0.16)");
      bg.addColorStop(1, "rgba(10,9,8,0)");
      ctxB.fillStyle = bg;
      ctxB.fillRect(0, 0, w, h);

      for (let i = 0; i < total; i += RAY_PROPS) updateRay(i);

      ctxB.save();
      ctxB.globalCompositeOperation = "lighter";
      ctxB.filter = "blur(26px)";
      ctxB.drawImage(offscreen, 0, 0);
      ctxB.filter = "blur(12px)";
      ctxB.globalAlpha = 0.82;
      ctxB.drawImage(offscreen, 0, 0);
      ctxB.filter = "none";
      ctxB.globalAlpha = 0.32;
      ctxB.drawImage(offscreen, 0, 0);
      ctxB.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onResize = () => {
      w = visible.width = visible.offsetWidth;
      h = visible.height = visible.offsetHeight;
      offscreen.width = w;
      offscreen.height = h;
      rebuild();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(visible);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
