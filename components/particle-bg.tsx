"use client";
import { useEffect, useRef } from "react";

const ACCENT = "201, 169, 97";
const VP_Y_RATIO = 0.38;

export default function BgCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const mouse = { x: w / 2, y: h / 2 };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const vpX = w / 2;
      const vpY = h * VP_Y_RATIO;

      // Perspective grid
      const vLines = 24;
      for (let i = 0; i <= vLines; i++) {
        const t = i / vLines;
        const x0 = w * t;
        const x1 = vpX + (x0 - vpX) * 3;
        ctx.beginPath();
        ctx.moveTo(x0, h);
        ctx.lineTo(x1, vpY);
        ctx.strokeStyle = `rgba(${ACCENT},${0.03 + 0.02 * Math.abs(t - 0.5) * 2})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      const hLines = 16;
      for (let i = 0; i <= hLines; i++) {
        const t = i / hLines;
        const y = h - (h - vpY) * Math.pow(t, 1.6);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.strokeStyle = `rgba(${ACCENT},${0.015 + 0.02 * t * t})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Chromatic glow — 3 offset radial gradients
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

      raf = requestAnimationFrame(draw);
    };

    let raf = requestAnimationFrame(draw);

    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }} />;
}
