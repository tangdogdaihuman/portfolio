"use client";

import type { MouseEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { setResolvedTheme, useResolvedTheme } from "@/lib/theme-client";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useResolvedTheme();

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const next = theme === "dark" ? "light" : "dark";
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => void;
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !reduced) {
      const root = document.documentElement;
      root.style.setProperty("--vt-x", `${event.clientX}px`);
      root.style.setProperty("--vt-y", `${event.clientY}px`);
      root.classList.add("vt-theme");
      doc.startViewTransition(() => {
        setResolvedTheme(next);
      });
      window.setTimeout(() => root.classList.remove("vt-theme"), 900);
    } else {
      setResolvedTheme(next);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "切换为浅色模式" : "切换为深色模式"}
      aria-pressed={theme === "dark"}
      data-theme-toggle
      data-hover
      className={`glass-chip relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-text transition-transform duration-300 hover:scale-105 active:scale-95 ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "light" ? (
          <m.svg
            key="sun"
            initial={{ rotate: -70, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 70, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="4.2" />
            <line x1="12" y1="2.5" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="21.5" />
            <line x1="2.5" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="21.5" y2="12" />
            <line x1="5.2" y1="5.2" x2="6.9" y2="6.9" />
            <line x1="17.1" y1="17.1" x2="18.8" y2="18.8" />
            <line x1="5.2" y1="18.8" x2="6.9" y2="17.1" />
            <line x1="17.1" y1="6.9" x2="18.8" y2="5.2" />
          </m.svg>
        ) : (
          <m.svg
            key="moon"
            initial={{ rotate: 70, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -70, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6Z" />
          </m.svg>
        )}
      </AnimatePresence>
    </button>
  );
}
