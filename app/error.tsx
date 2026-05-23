"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center px-6">
        <p className="font-display text-6xl text-accent/30 mb-4 tracking-wider">500</p>
        <p className="text-text-muted text-lg mb-8">页面加载失败，请重试</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="px-4 py-2 border border-border text-text-muted hover:text-text transition-colors"
          >
            重试
          </button>
          <Link href="/" className="nav-link text-accent">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

