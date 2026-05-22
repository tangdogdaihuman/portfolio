"use client";
import { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise";

const RAY_COUNT = 400;
const RAY_PROPS = 7;
const BASE_LEN = 200;
const RANGE_LEN = 200;
const BASE_SPEED = 0.02;
const RANGE_SPEED = 0.06;
const BASE_WIDTH = 5;
const RANGE_WIDTH = 12;
const BASE_TTL = 40;
const RANGE_TTL = 80;
const NOISE_STR = 50;
const X_OFF = 0.0012;
const Y_OFF = 0.0012;
const Z_OFF = 0.0012;

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
    const total = RAY_COUNT * RAY_PROPS;
    const props = new Float32Array(total);
    let tick = 0;

    function rand(r: number) { return Math.random() * r; }

    function initRay(i: number) {
      const x = rand(w);
      const mid = h * 0.5;
      const len = BASE_LEN + rand(RANGE_LEN);
      const y1 = mid + NOISE_STR;
      const y2 = y1 - len - rand(60);
      const n = noise3D(x * X_OFF, y1 * Y_OFF, tick * Z_OFF) * NOISE_STR;
      const speed = BASE_SPEED + rand(RANGE_SPEED) * (Math.round(rand(1)) ? 1 : -1);
      props.set([x, y1 + n, y2 + n, 0, BASE_TTL + rand(RANGE_TTL), BASE_WIDTH + rand(RANGE_WIDTH), speed], i);
    }

    for (let i = 0; i < total; i += RAY_PROPS) initRay(i);

    function fadeInOut(life: number, ttl: number) {
      return Math.sin((life / ttl) * Math.PI);
    }

    function drawRay(i: number) {
      const x = props[i], y1 = props[i + 1], y2 = props[i + 2];
      const life = props[i + 3], ttl = props[i + 4], width = props[i + 5];
      const a = fadeInOut(life, ttl);

      const gradient = ctxA!.createLinearGradient(x, y1, x, y2);
      gradient.addColorStop(0, "rgba(201,169,97,0)");
      gradient.addColorStop(0.5, `rgba(201,169,97,${a * 0.5})`);
      gradient.addColorStop(1, "rgba(201,169,97,0)");

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

      ctxB.globalCompositeOperation = "source-over";
      ctxB.fillStyle = "#0a0908";
      ctxB.fillRect(0, 0, w, h);

      for (let i = 0; i < total; i += RAY_PROPS) updateRay(i);

      ctxB.save();
      ctxB.filter = "blur(16px)";
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
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(visible);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
