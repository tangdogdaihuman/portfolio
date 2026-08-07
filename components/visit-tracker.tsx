"use client";

import { useEffect } from "react";

export default function VisitTracker() {
  useEffect(() => {
    const path = window.location.pathname;
    const dedupeKey = `visit_tracked:${path}`;
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");

    fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, referrer: document.referrer || "" }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
