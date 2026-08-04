"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribeFinePointer(callback: () => void) {
  const mq = window.matchMedia("(pointer: fine)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getFinePointerSnapshot() {
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function GlassCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("");
  const enabled = useSyncExternalStore(subscribeFinePointer, getFinePointerSnapshot, () => false);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("hide-native-cursor");
    return () => document.documentElement.classList.remove("hide-native-cursor");
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const cursor = cursorRef.current;
    const ring = ringRef.current;
    if (!cursor || !ring) return;

    let mx = -100;
    let my = -100;
    let rx = -100;
    let ry = -100;
    let ringScale = 0;
    let ringScaleTarget = 0;
    let hasPosition = false;
    let raf = 0;

    const render = () => {
      raf = 0;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ringScale += (ringScaleTarget - ringScale) * 0.18;
      cursor.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${ringScale})`;
      const settled =
        Math.abs(mx - rx) < 0.05 &&
        Math.abs(my - ry) < 0.05 &&
        Math.abs(ringScaleTarget - ringScale) < 0.004;
      if (!settled) raf = requestAnimationFrame(render);
    };
    const wake = () => {
      if (!raf && hasPosition) raf = requestAnimationFrame(render);
    };

    const onMove = (event: MouseEvent) => {
      mx = event.clientX;
      my = event.clientY;
      if (!hasPosition || Math.hypot(mx - rx, my - ry) > 160) {
        hasPosition = true;
        rx = mx;
        ry = my;
      }
      cursor.style.opacity = "1";
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cursor], a, button");
      const nextLabel = target?.dataset.cursor ?? "";
      ringScaleTarget = target ? 1 : 0;
      setLabel((current) => (current === nextLabel ? current : nextLabel));
      wake();
    };

    const onLeave = () => {
      cursor.style.opacity = "0";
      ringScaleTarget = 0;
      wake();
    };

    const onScroll = () => {
      cursor.style.opacity = "0";
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div ref={cursorRef} className="bead-cursor" style={{ opacity: 0 }} aria-hidden="true" />
      <div
        ref={ringRef}
        className={`bead-ring ${label ? "bead-active" : ""}`}
        style={{ transform: "translate3d(-100px, -100px, 0) scale(0)" }}
        aria-hidden="true"
      >
        <span>{label}</span>
      </div>
    </>
  );
}
