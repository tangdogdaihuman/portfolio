import { useCallback, useEffect, useRef, useState } from "react";
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
