"use client";

import { useEffect } from "react";

export default function DeferredFontStylesheet({ href }: { href: string }) {
  useEffect(() => {
    if (document.querySelector('link[data-deferred-font="noto-serif-sc"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-deferred-font", "noto-serif-sc");
    document.head.appendChild(link);
  }, [href]);

  return null;
}
