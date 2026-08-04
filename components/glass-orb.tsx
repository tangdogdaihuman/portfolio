"use client";

import { useEffect } from "react";
import { m, useMotionValue, useSpring } from "framer-motion";
import { useGlassFilter } from "@/components/glass-surface";

export default function GlassOrb({ size = 220, className = "" }: { size?: number; className?: string }) {
  const { containerRef, filterStyle, defs } = useGlassFilter({
    radius: size / 2,
    bezel: size * 0.3,
    displacement: 30,
  });
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 42, damping: 13, mass: 1.1 });
  const sy = useSpring(my, { stiffness: 42, damping: 13, mass: 1.1 });

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const onMove = (event: MouseEvent) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      mx.set(nx * 56);
      my.set(ny * 56);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      <m.div style={{ x: sx, y: sy }}>
        <div
          ref={containerRef}
          className="glass glass-refraction rounded-full"
          style={{
            width: size,
            height: size,
            ...filterStyle,
            boxShadow:
              "inset 0 2px 6px var(--glass-inset), inset -10px -16px 32px color-mix(in srgb, var(--color-accent) 22%, transparent), inset 8px 12px 24px rgba(255, 255, 255, 0.1), var(--glass-shadow)",
          }}
        >
          {defs}
          <div
            className="absolute rounded-full"
            style={{
              left: "16%",
              top: "10%",
              width: "42%",
              height: "26%",
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.5), transparent 70%)",
              filter: "blur(6px)",
              transform: "rotate(-18deg)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 72% 82%, color-mix(in srgb, var(--color-accent) 30%, transparent), transparent 55%)",
            }}
          />
        </div>
      </m.div>
    </div>
  );
}
