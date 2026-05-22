"use client";
import { useEffect, useRef } from "react";
import { createNoise2D } from "simplex-noise";

const RAYS = 24;
const SEGMENTS = 40;
const SPEED = 0.0003;

export default function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = canvas.width = canvas.offsetWidth;
    let h = canvas.height = canvas.offsetHeight;
    const noise2D = createNoise2D();
    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      time += SPEED;

      for (let i = 0; i < RAYS; i++) {
        const baseX = (w / (RAYS - 1)) * i;
        const gradient = ctx.createLinearGradient(0, h, 0, h * 0.2);
        gradient.addColorStop(0, "rgba(201,169,97,0.18)");
        gradient.addColorStop(0.3, "rgba(201,169,97,0.06)");
        gradient.addColorStop(1, "transparent");

        ctx.beginPath();
        ctx.moveTo(baseX, h);

        for (let s = 1; s <= SEGMENTS; s++) {
          const t = s / SEGMENTS;
          const y = h * (1 - t);
          const noise = noise2D(baseX / w * 2.5, time + t * 1.5);
          const wobble = noise * w * 0.12 * t * t;
          const x = baseX + wobble;
          ctx.lineTo(x, y);
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    let raf = requestAnimationFrame(draw);

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
