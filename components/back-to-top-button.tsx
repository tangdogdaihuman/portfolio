"use client";

import { useEffect, useState } from "react";

export default function BackToTopButton() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setShowBackToTop(window.scrollY > Math.max(280, window.innerHeight * 0.55));
    };
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  if (!showBackToTop) return null;

  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-4 md:right-6 bottom-4 md:bottom-6 z-[80] w-11 h-11 inline-flex items-center justify-center border border-border/80 bg-bg/78 backdrop-blur-sm text-text-muted hover:text-accent hover:border-accent transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
