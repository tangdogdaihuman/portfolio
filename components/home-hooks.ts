import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Section, Work } from "@/lib/types";

const WORKS_REFRESH_MIN_INTERVAL = 30000;
const META_REFRESH_MIN_INTERVAL = 600000;

export function useHomeDataRefresh({
  initialIntro,
  initialTagline,
  initialWorks,
  initialSections,
  initialLoadError,
  defaultTagline,
}: {
  initialIntro: string;
  initialTagline: string;
  initialWorks: Work[];
  initialSections: Section[];
  initialLoadError: boolean;
  defaultTagline: string;
}) {
  const [intro, setIntro] = useState(initialIntro);
  const [tagline, setTagline] = useState(initialTagline || defaultTagline);
  const [detailSections, setDetailSections] = useState<Section[]>(initialSections);
  const [loadError, setLoadError] = useState(initialLoadError);
  const [loadingWorks, setLoadingWorks] = useState(initialWorks.length === 0 && !initialLoadError);
  const [expandedSection, setExpandedSection] = useState<string | null>(initialSections[0]?.id ?? null);
  const [works, setWorks] = useState<Work[]>(initialWorks);
  const refreshInFlightRef = useRef(false);
  const lastWorksRefreshAtRef = useRef(0);
  const lastMetaRefreshAtRef = useRef(0);

  const refreshData = useCallback(async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (refreshInFlightRef.current) return;
    if (!options?.force && now - lastWorksRefreshAtRef.current < WORKS_REFRESH_MIN_INTERVAL) return;
    refreshInFlightRef.current = true;
    const fetchMeta = Boolean(options?.force) || now - lastMetaRefreshAtRef.current >= META_REFRESH_MIN_INTERVAL;

    try {
      const worksRequest = fetch("/api/works");
      const introRequest = fetchMeta ? fetch("/api/intro") : null;
      const sectionsRequest = fetchMeta ? fetch("/api/detail-sections") : null;

      const worksRes = await worksRequest;
      if (!worksRes.ok) throw new Error("refresh failed");

      const nextWorks = (await worksRes.json()) as Work[];
      setWorks(nextWorks);
      setLoadError(false);
      lastWorksRefreshAtRef.current = Date.now();

      if (introRequest && sectionsRequest) {
        try {
          const [introRes, sectionsRes] = await Promise.all([introRequest, sectionsRequest]);
          if (!introRes.ok || !sectionsRes.ok) return;
          const [introData, nextSections] = await Promise.all([
            introRes.json() as Promise<{ content?: string; tagline?: string }>,
            sectionsRes.json() as Promise<Section[]>,
          ]);
          setIntro(introData.content || "");
          setTagline((introData.tagline || "").trim() || defaultTagline);
          setDetailSections(nextSections);
          setExpandedSection((current) => {
            if (nextSections.length === 0) return null;
            if (!current) return nextSections[0].id;
            return nextSections.some((section) => section.id === current) ? current : nextSections[0].id;
          });
          lastMetaRefreshAtRef.current = Date.now();
        } catch {
        }
      }
    } catch {
      setLoadError(true);
    } finally {
      refreshInFlightRef.current = false;
      setLoadingWorks(false);
    }
  }, [defaultTagline]);

  useEffect(() => { const iv = setInterval(refreshData, 300000); return () => clearInterval(iv); }, [refreshData]);

  useEffect(() => {
    if (!initialLoadError) {
      lastWorksRefreshAtRef.current = Date.now();
      lastMetaRefreshAtRef.current = Date.now();
    }
  }, [initialLoadError]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshData]);

  return {
    intro,
    tagline,
    detailSections,
    loadError,
    loadingWorks,
    expandedSection,
    setExpandedSection,
    works,
    refreshData,
  };
}

export function useCustomCursor(
  cursorRef: RefObject<HTMLDivElement | null>,
  ringRef: RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    document.body.classList.add("home-vignette");
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (finePointer && !reducedMotion) {
      document.body.style.cursor = "none";
    }
    return () => {
      document.body.style.cursor = "";
      document.body.classList.remove("home-vignette");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return;
    const cursor = cursorRef.current, ring = ringRef.current;
    if (!cursor || !ring) return;
    let mx = 0, my = 0, rx = 0, ry = 0;
    let cursorScale = 1, ringScale = 1;
    let cursorScaleTarget = 1, ringScaleTarget = 1;
    let hasRingPosition = false;
    let raf = 0;
    const setCursorVisibility = (visible: boolean) => {
      const opacity = visible ? "1" : "0";
      cursor.style.opacity = opacity;
      ring.style.opacity = opacity;
    };
    const cursorTransform = () => `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%) scale(${cursorScale})`;
    const ringTransform = () => `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${ringScale})`;
    const animate = () => {
      raf = 0;
      rx += (mx - rx) * 0.15;
      ry += (my - ry) * 0.15;
      ringScale += (ringScaleTarget - ringScale) * 0.2;
      cursorScale += (cursorScaleTarget - cursorScale) * 0.2;
      ring.style.transform = ringTransform();
      cursor.style.transform = cursorTransform();
      const settled =
        Math.abs(mx - rx) < 0.05 && Math.abs(my - ry) < 0.05 &&
        Math.abs(ringScaleTarget - ringScale) < 0.005 &&
        Math.abs(cursorScaleTarget - cursorScale) < 0.005;
      if (!settled) raf = requestAnimationFrame(animate);
    };
    const wake = () => {
      if (!raf && hasRingPosition) raf = requestAnimationFrame(animate);
    };
    const onScroll = () => {
      if (!hasRingPosition) return;
      setCursorVisibility(false);
    };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (!hasRingPosition || Math.hypot(mx - rx, my - ry) > 180) {
        hasRingPosition = true;
        rx = mx; ry = my;
        ring.style.transform = ringTransform();
      }
      cursor.style.transform = cursorTransform();
      setCursorVisibility(true);
      const hovering = (e.target as HTMLElement).closest(".work-card, a, button, [data-hover]");
      ringScaleTarget = hovering ? 2 : 1;
      cursorScaleTarget = hovering ? 0 : 1;
      if (hovering) { ring.classList.add("hover"); }
      else { ring.classList.remove("hover"); }
      wake();
    };
    setCursorVisibility(false);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cursorRef, ringRef]);
}

export function useActiveHomeSection(worksLength: number, detailSectionLength: number) {
  const [activeSection, setActiveSection] = useState<"works" | "about" | "contact">("works");

  useEffect(() => {
    const sections = ["works", "about", "contact"] as const;
    let raf = 0;

    const updateActiveSection = () => {
      const scrollBottom = window.scrollY + window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const marker = window.scrollY + Math.max(180, window.innerHeight * 0.4);
      let nextActive: "works" | "about" | "contact" = "works";

      if (scrollBottom >= docHeight - 24) {
        setActiveSection((current) => (current === "contact" ? current : "contact"));
        raf = 0;
        return;
      }

      for (const id of sections) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top + window.scrollY <= marker) nextActive = id;
      }

      setActiveSection((current) => (current === nextActive ? current : nextActive));
      raf = 0;
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [worksLength, detailSectionLength]);

  return activeSection;
}
