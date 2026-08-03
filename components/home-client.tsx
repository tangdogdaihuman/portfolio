"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useState, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { LazyMotion, domAnimation, m, AnimatePresence, useScroll, useTransform, MotionConfig, type MotionValue } from "framer-motion";
import type { Section, Work } from "@/lib/types";
import BgCanvas from "@/components/particle-bg";
import AuroraCanvas from "@/components/aurora-canvas";
import ThemeToggle from "@/components/theme-toggle";
import BackToTopButton from "@/components/back-to-top-button";
import { useActiveHomeSection, useCustomCursor, useHomeDataRefresh } from "@/components/home-hooks";

const spring = { type: "spring" as const, damping: 28, stiffness: 200, mass: 0.8 };
const DEFAULT_TAGLINE = "Hard Surface / Stylized Character / Game Art";
const HERO_NAME_CHARS = ["唐", "子", "航"];
const HERO_SUBTITLE_WORDS = ["Tang", "Zihang", "CG", "Portfolio"];

function subscribeCoarsePointer(callback: () => void) {
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getCoarsePointerSnapshot() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function getCoarsePointerServerSnapshot() {
  return false;
}

function htmlToSafeText(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<\s*(strong|b)\s*>/gi, "**")
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, "**")
    .replace(/<\s*(em|i|u)\s*>/gi, "")
    .replace(/<\s*\/\s*(em|i|u)\s*>/gi, "")
    .replace(/<[^>]+>/g, "");
}

function renderBoldContent(text: string) {
  if (!text) return null;
  const safeText = htmlToSafeText(text);
  return safeText.split(/(\*\*.*?\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function IntroLine({
  line,
  index,
  scrollYProgress,
}: {
  line: string;
  index: number;
  scrollYProgress: MotionValue<number>;
}) {
  const exitStart = 0.4 + index * 0.04;
  const exitEnd = exitStart + 0.12;
  const opacity = useTransform(scrollYProgress, [0, exitStart, exitEnd], [1, 1, 0]);
  const blur = useTransform(scrollYProgress, [0, exitStart, exitEnd], [0, 0, 8]);
  const scale = useTransform(scrollYProgress, [0, exitStart, exitEnd], [1, 1, 0.9]);
  const filter = useTransform(blur, (value: number) => `blur(${value}px)`);

  return (
    <m.div style={{ opacity, scale, filter }}>
      <m.p
        initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, delay: index * 0.08, ease: [0.2, 0.9, 0.3, 1] }}
        className="text-[clamp(0.95rem,2vw,1.12rem)] text-text/75 leading-[1.85] mb-3.5 hero-copy-shadow"
      >
        {line}
      </m.p>
    </m.div>
  );
}

function WorkThumbImage({ work }: { work: Work }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setReady(true));
      });
    }
  }, [work.thumb_url]);

  return (
    <Image
      ref={imageRef}
      src={work.thumb_url}
      alt={work.title}
      width={1200}
      height={1600}
      unoptimized
      className={`work-thumb ${ready ? "work-thumb-ready" : ""} block mx-auto w-full h-auto max-h-[32rem] object-contain object-center`}
      sizes="(max-width: 768px) 92vw, (max-width: 1280px) 50vw, 36vw"
      loading="lazy"
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth > 0) {
          setReady(true);
        }
      }}
      onError={() => setReady(true)}
    />
  );
}

function SectionHeader({ index, label, title }: { index: string; label: string; title: string }) {
  return (
    <div className="reveal">
      <div className="flex items-center gap-4 mb-4">
        <span className="font-display italic text-accent text-2xl leading-none">{index}</span>
        <div className="divider-line" />
        <span className="text-xs tracking-[0.4em] uppercase text-text-muted">{label}</span>
      </div>
      <h2 className="font-display text-2xl md:text-4xl text-accent mb-8 md:mb-10">{title}</h2>
    </div>
  );
}

const SiteNav = memo(function SiteNav({ worksCount, sectionsCount }: { worksCount: number; sectionsCount: number }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeSection = useActiveHomeSection(worksCount, sectionsCount);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  const navClass = (id: "works" | "about" | "contact") => `nav-link ${activeSection === id ? "nav-link-active text-text" : ""}`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-[70] px-4 md:px-10 py-3.5 md:py-4.5 flex justify-between items-center bg-bg/70 backdrop-blur-md border-b border-border/30">
        <a href="#" className="font-display text-lg tracking-wider text-text">Portfolio</a>
        <div className="hidden md:flex items-center gap-7 text-[0.67rem] tracking-[0.22em] uppercase text-text-muted">
          <a href="#works" className={navClass("works")}>作品</a>
          <a href="#about" className={navClass("about")}>关于</a>
          <a href="#contact" className={navClass("contact")}>联系</a>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={mobileNavOpen ? "关闭导航菜单" : "打开导航菜单"}
            onClick={() => setMobileNavOpen((open) => !open)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 border border-border text-text-muted hover:text-text transition-colors"
          >
          {mobileNavOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
          )}
        </button>
        {mobileNavOpen && (
          <div className="absolute top-full right-4 mt-2 w-44 bg-surface border border-border/80 p-2 md:hidden">
            <a href="#works" onClick={() => setMobileNavOpen(false)} className={`block px-3 py-3 text-xs tracking-[0.2em] uppercase transition-colors ${activeSection === "works" ? "text-text" : "text-text-muted hover:text-accent"}`}>作品</a>
            <a href="#about" onClick={() => setMobileNavOpen(false)} className={`block px-3 py-3 text-xs tracking-[0.2em] uppercase transition-colors ${activeSection === "about" ? "text-text" : "text-text-muted hover:text-accent"}`}>关于</a>
            <a href="#contact" onClick={() => setMobileNavOpen(false)} className={`block px-3 py-3 text-xs tracking-[0.2em] uppercase transition-colors ${activeSection === "contact" ? "text-text" : "text-text-muted hover:text-accent"}`}>联系</a>
          </div>
        )}
        </div>
      </nav>
  );
});

export default function HomeClient({
  initialIntro,
  initialTagline,
  initialWorks,
  initialSections,
  initialLoadError,
}: {
  initialIntro: string;
  initialTagline: string;
  initialWorks: Work[];
  initialSections: Section[];
  initialLoadError: boolean;
}) {
  const {
    intro,
    tagline,
    detailSections,
    loadError,
    loadingWorks,
    expandedSection,
    setExpandedSection,
    works,
    refreshData,
  } = useHomeDataRefresh({
    initialIntro,
    initialTagline,
    initialWorks,
    initialSections,
    initialLoadError,
    defaultTagline: DEFAULT_TAGLINE,
  });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"default" | "newest" | "oldest">("default");
  const coarsePointer = useSyncExternalStore(subscribeCoarsePointer, getCoarsePointerSnapshot, getCoarsePointerServerSnapshot);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const revealObserverRef = useRef<IntersectionObserver | null>(null);
  useCustomCursor(cursorRef, ringRef);

  useEffect(() => {
    if (!revealObserverRef.current) {
      revealObserverRef.current = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserverRef.current?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
    }
    const obs = revealObserverRef.current;
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => obs.observe(el));
  }, [works, detailSections, loadingWorks]);

  useEffect(() => () => {
    revealObserverRef.current?.disconnect();
    revealObserverRef.current = null;
  }, []);

  const tags = useMemo(() => [...new Set(works.flatMap((w) => w.tags))], [works]);
  const filtered = useMemo(
    () => (activeTag ? works.filter((w) => w.tags.includes(activeTag)) : works),
    [activeTag, works]
  );
  const sorted = useMemo(() => {
    if (sortMode === "default") return filtered;
    const byDate = [...filtered].sort((a, b) => {
      const da = a.work_date || "";
      const db = b.work_date || "";
      return sortMode === "newest" ? db.localeCompare(da) : da.localeCompare(db);
    });
    return byDate;
  }, [filtered, sortMode]);

  const sortOptions: Array<{ value: "default" | "newest" | "oldest"; label: string }> = [
    { value: "default", label: "精选" },
    { value: "newest", label: "最新" },
    { value: "oldest", label: "最早" },
  ];

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const portfolioOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  const portfolioBlur = useTransform(scrollYProgress, [0, 0.45], [0, 12]);
  const portfolioFilter = useTransform(portfolioBlur, (v: number) => `blur(${v}px)`);
  const portfolioScale = useTransform(scrollYProgress, [0, 0.45], [1, 0.88]);

  const introRows = useMemo(() => intro.split("\n"), [intro]);

  const marqueeLabel = useMemo(() => {
    const marqueeItems = tags.length > 0 ? tags : ["Digital Art", "Character Design", "3D", "Illustration"];
    return `${marqueeItems.join(" · ")} ·`;
  }, [tags]);

  return (
    <MotionConfig reducedMotion="user">
    <LazyMotion features={domAnimation}>
    <>
      <div ref={cursorRef} className="cursor hidden md:block" />
      <div ref={ringRef} className="cursor-ring hidden md:block" />

      <SiteNav worksCount={works.length} sectionsCount={detailSections.length} />

      <BgCanvas />

      <div className="relative z-10">
        {/* Hero */}
        <section ref={heroRef} className="hero-noise min-h-svh md:min-h-screen relative flex flex-col items-center justify-center px-4 overflow-hidden">
          <AuroraCanvas />
          <div className="hero-contrast-scrim z-[1] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-6xl mx-auto">
            <m.div
              style={{ opacity: portfolioOpacity, scale: portfolioScale, filter: portfolioFilter }}
              className="text-center pointer-events-none"
            >
              <m.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.2, 0.9, 0.3, 1] }}
                className="text-xs text-accent-dim uppercase mb-6 tracking-[0.2em] hero-copy-shadow"
              >
                CG Artist Portfolio
              </m.p>
              <h1 className="font-display leading-[1.02] text-text hero-title-shadow" aria-label="唐子航 Tang Zihang CG Portfolio">
                <span className="block px-[6px] pt-[4px] pb-[0.06em]" aria-hidden="true">
                  {HERO_NAME_CHARS.map((char, i) => (
                    <span key={`${char}-${i}`} className="inline-block overflow-hidden align-top pb-[0.05em]">
                      <m.span
                        initial={{ y: "115%" }}
                        animate={{ y: 0 }}
                        transition={{ duration: 1.1, ease: [0.2, 0.9, 0.3, 1], delay: 0.08 + i * 0.08 }}
                        className="inline-block font-display-sc text-[clamp(2.8rem,9vw,6.2rem)]"
                      >
                        {char}
                      </m.span>
                    </span>
                  ))}
                </span>
                <span className="block px-[6px] pt-[4px] mt-1.5 pb-[0.14em]" aria-hidden="true">
                  {HERO_SUBTITLE_WORDS.map((word, i) => (
                    <span key={`${word}-${i}`}>
                      <span className="inline-block overflow-hidden align-top pb-[0.08em]">
                        <m.span
                          initial={{ y: "115%" }}
                          animate={{ y: 0 }}
                          transition={{ duration: 0.95, ease: [0.2, 0.9, 0.3, 1], delay: 0.34 + i * 0.06 }}
                          className="inline-block text-[clamp(1.05rem,3.8vw,2.25rem)] text-accent hero-subtitle-shadow"
                        >
                          {word}
                        </m.span>
                      </span>
                      {i < HERO_SUBTITLE_WORDS.length - 1 ? " " : ""}
                    </span>
                  ))}
                </span>
              </h1>
              <m.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 1, delay: 0.72, ease: [0.2, 0.9, 0.3, 1] }}
                className="hero-rule mt-7 mx-auto"
                aria-hidden="true"
              />
              <m.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.8, ease: [0.2, 0.9, 0.3, 1] }}
                className="mt-4 text-[0.7rem] uppercase tracking-[0.18em] text-text/70 hero-copy-shadow"
              >
                {tagline}
              </m.p>
            </m.div>

            {intro && (
               <div className="mt-6 max-w-[46rem] mx-auto text-center px-3">
                {(() => {
                  let visibleIndex = 0;
                  return introRows.map((line, rowIndex) => {
                    if (!line.trim()) return <div key={`intro-space-${rowIndex}`} className="h-3.5" aria-hidden="true" />;
                    const currentIndex = Math.min(visibleIndex, 9);
                    visibleIndex += 1;
                    return <IntroLine key={`${rowIndex}-${line}`} line={line.trim()} index={currentIndex} scrollYProgress={scrollYProgress} />;
                  });
                })()}
              </div>
            )}

            <m.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.95, ease: [0.2, 0.9, 0.3, 1] }}
              className="mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
            >
              <a href="#works" className="cta-btn min-h-11 inline-flex items-center justify-center gap-2.5 px-7 py-2.5 text-[0.68rem] tracking-[0.22em] uppercase text-text border border-border/80" data-hover>
                浏览作品
                <span className="cta-arrow" aria-hidden="true">→</span>
              </a>
              <a href="#contact" className="cta-ghost min-h-11 inline-flex items-center justify-center px-2 py-2.5 text-[0.68rem] tracking-[0.22em] uppercase text-text-muted hover:text-text transition-colors" data-hover>
                联系我
              </a>
            </m.div>
          </div>

          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
            <m.div
              style={{ opacity: portfolioOpacity }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center"
            >
              <p className="text-[0.6rem] tracking-[0.35em] uppercase text-text-muted mb-4">Scroll</p>
              <span className="scroll-line" />
            </m.div>
          </m.div>
        </section>

      {/* Marquee */}
      <section className="py-3 md:py-4 border-y border-border/20 overflow-hidden">
        <div className="overflow-hidden">
          <div className="marquee-track">
            {[0, 1].map((loop) => (
              <div key={loop} className="marquee-segment" aria-hidden={loop === 1}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={`${loop}-${i}`} className="font-display italic text-lg md:text-xl text-text-muted/20 tracking-wider whitespace-nowrap flex-shrink-0">
                    {marqueeLabel}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Works */}
      <section id="works" className="scroll-mt-24 md:scroll-mt-28 px-4 md:px-6 pt-14 md:pt-16 pb-20 md:pb-24 max-w-7xl mx-auto">
        <SectionHeader index="01" label="Portfolio" title="作品集" />

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:gap-2.5 mb-10 md:mb-14 reveal">
            <button onClick={() => setActiveTag(null)} className={`min-h-11 px-3.5 py-2 text-[0.64rem] tracking-[0.12em] uppercase transition-colors border ${activeTag === null ? "text-accent border-accent/70 bg-surface" : "text-text-muted border-border/60 hover:text-text"}`}>All</button>
            {tags.map((t) => (
              <button key={t} onClick={() => setActiveTag(t)} className={`min-h-11 px-3.5 py-2 text-[0.64rem] tracking-[0.12em] uppercase transition-colors border ${activeTag === t ? "text-accent border-accent/70 bg-surface" : "text-text-muted border-border/60 hover:text-text"}`}>{t}</button>
            ))}
            <span className="flex-1" />
            <div className="inline-flex border border-border/70">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={sortMode === option.value}
                  onClick={() => setSortMode(option.value)}
                  className={`min-h-11 px-3.5 text-[0.6rem] tracking-[0.16em] uppercase transition-colors ${
                    sortMode === option.value
                      ? "text-accent bg-surface"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loadingWorks ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-14 md:gap-x-10 md:gap-y-24">
            {Array.from({ length: 4 }).map((_, i) => {
              const colSpan = i % 3 === 0 ? "md:col-span-8" : i % 3 === 1 ? "md:col-span-5" : "md:col-span-7";
              return (
                <div key={`skeleton-${i}`} className={`reveal ${colSpan}`}>
                  <div className="work-card-frame">
                    <div className="h-64 md:h-80 bg-surface/70 animate-pulse" />
                  </div>
                  <div className="card-meta space-y-2">
                    <div className="h-3 w-28 bg-surface animate-pulse" />
                    <div className="h-6 w-2/3 bg-surface animate-pulse" />
                    <div className="h-3 w-1/2 bg-surface animate-pulse" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="status-surface text-center py-16 md:py-20 text-text-muted reveal">
            <p className="text-sm tracking-[0.08em] uppercase">{loadError ? "内容暂时加载失败，请稍后刷新" : "还没有作品"}</p>
            {loadError && (
              <button
                onClick={() => refreshData({ force: true })}
                className="mt-5 px-5 py-2 border border-border text-xs tracking-[0.16em] text-accent hover:bg-accent hover:text-bg transition-colors"
              >
                重试加载
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-14 md:gap-x-10 md:gap-y-24">
            <AnimatePresence mode="popLayout">
            {sorted.map((work, i) => {
              const w = work.size_weight ?? 1;
              const colSpan = w >= 1.5 ? "md:col-span-8" : w >= 1.0 ? "md:col-span-7" : "md:col-span-4";
              return (
                <m.div
                  key={work.id}
                  layout={coarsePointer ? false : true}
                  initial={{ opacity: 0, y: 34, scale: 0.985 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.75, ease: [0.2, 0.9, 0.3, 1], delay: (i % 3) * 0.08 } }}
                  viewport={{ once: true, margin: "-60px" }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.3, ease: "easeIn" } }}
                  transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}
                  className={`work-card group ${colSpan}`}
                >
                  <Link href={`/work/${work.id}`} className="block" data-hover>
                    <div className="work-card-frame">
                      <WorkThumbImage work={work} />
                      <div className="work-card-veil" aria-hidden="true" />
                      <span className="work-card-cta" aria-hidden="true">
                        查看作品
                        <span className="cta-arrow">↗</span>
                      </span>
                    </div>
                    <div className="card-meta">
                      <div className="flex items-baseline gap-3 text-[0.58rem] tracking-[0.28em] uppercase text-accent-dim">
                        <span className="text-text-muted/50">{String(i + 1).padStart(2, "0")}</span>
                        {work.pinned && <span className="text-accent">Featured</span>}
                        {work.work_date && <span>{work.work_date}</span>}
                      </div>
                      <h3 className="font-display text-[1.2rem] md:text-[1.5rem] text-text mt-2 leading-[1.12] group-hover:text-accent transition-colors duration-300">{work.title}</h3>
                      <div className="flex items-center gap-2.5 flex-wrap text-[0.68rem] text-text-muted tracking-[0.11em] mt-2">
                        {work.tags.slice(0, 2).map((t) => <span key={t} className="text-accent-dim/90">{t}</span>)}
                        <span className="text-text-muted/60">{(work.image_count || 1) > 1 ? `${work.image_count} 张图集` : "单图展示"}</span>
                      </div>
                    </div>
                  </Link>
                </m.div>
              );
            })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* About */}
      {detailSections.length > 0 && (
        <section id="about" className="scroll-mt-24 md:scroll-mt-28 px-4 md:px-6 pb-14 md:pb-16 max-w-7xl mx-auto">
          <SectionHeader index="02" label="About" title="详细介绍" />
          <div className="max-w-2xl">
            {detailSections.map((s, i) => {
              const isOpen = expandedSection === s.id;
              return (
                <m.div
                  key={s.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ ...spring, delay: i * 0.05 }}
                  className="about-row group border-b border-border/30"
                >
                  <button
                    onClick={() => setExpandedSection(isOpen ? null : s.id)}
                    aria-expanded={isOpen}
                    aria-controls={`about-panel-${s.id}`}
                    className="w-full min-h-11 flex items-center justify-between gap-4 py-5 px-3 -mx-3 text-left transition-colors duration-300 hover:bg-surface/60"
                    data-hover
                  >
                    <span className="flex items-baseline gap-4">
                      <span className="font-display italic text-[0.7rem] text-accent-dim/70">{String(i + 1).padStart(2, "0")}</span>
                      <span className={`font-display text-lg md:text-xl transition-colors duration-300 ${isOpen ? "text-accent" : "text-text-muted group-hover:text-text"}`}>{s.title}</span>
                    </span>
                    <m.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={spring}
                      className={`about-plus ${isOpen ? "about-plus-open" : ""}`}
                    >
                      +
                    </m.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <m.div
                        id={`about-panel-${s.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <m.div
                          initial={{ y: -10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -6, opacity: 0 }}
                          transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1] }}
                          className="pb-6 px-3 -mx-3"
                        >
                          <div className="border-l border-accent-dim/40 pl-5 text-sm text-text-muted leading-[1.9] whitespace-pre-wrap">
                            {renderBoldContent(s.content)}
                          </div>
                        </m.div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </m.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Contact */}
      <section id="contact" className="scroll-mt-24 md:scroll-mt-28 px-4 md:px-6 py-14 md:py-20 border-t border-border/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-12 gap-12">
            <div className="md:col-span-7">
              <SectionHeader index="03" label="Contact" title="联系方式" />
              <div className="reveal" style={{ "--reveal-delay": "0.12s" } as CSSProperties}>
                <p className="text-text-muted text-sm leading-[1.9] max-w-md mb-9">
                  有项目合作、工作机会，或任何关于 3D 艺术的想法，欢迎随时联系。
                </p>
                <a href="mailto:1193662756@qq.com" className="nav-link font-display text-[clamp(1.4rem,3.4vw,2.2rem)] leading-tight text-text hover:text-accent transition-colors break-all" data-hover>
                  1193662756@qq.com
                </a>
              </div>
            </div>
            <div className="md:col-span-5 md:pt-32">
              <div className="reveal" style={{ "--reveal-delay": "0.08s" } as CSSProperties}>
                <div className="text-xs tracking-[0.3em] uppercase text-text-muted mb-4">其他方式</div>
                <div className="border-t border-border/50">
                  <div className="contact-row">
                    <span className="contact-row-label">微信</span>
                    <span className="text-text">T15918177465</span>
                  </div>
                  <div className="contact-row">
                    <span className="contact-row-label">电话</span>
                    <span className="text-text">15918177465</span>
                  </div>
                </div>
              </div>
              <div className="reveal mt-11" style={{ "--reveal-delay": "0.16s" } as CSSProperties}>
                <div className="text-xs tracking-[0.3em] uppercase text-text-muted mb-4">Follow</div>
                <div className="border-t border-border/50">
                  <a href="https://github.com/tangdogdaihuman" target="_blank" rel="noopener noreferrer" className="contact-row font-display text-base" data-hover>
                    <span>GitHub</span>
                    <span className="cta-arrow text-accent-dim" aria-hidden="true">↗</span>
                  </a>
                  <a href="https://www.artstation.com/uuey7" target="_blank" rel="noopener noreferrer" className="contact-row font-display text-base" data-hover>
                    <span>ArtStation</span>
                    <span className="cta-arrow text-accent-dim" aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10 flex flex-col md:flex-row items-center justify-between gap-3 text-[0.6rem] tracking-[0.28em] uppercase text-text-muted/60">
          <p>&copy; {new Date().getFullYear()} 唐子航 · Tang Zihang</p>
          <p className="hidden md:block">Hard Surface · Stylized Character · Game Art</p>
          <p>All Rights Reserved</p>
        </div>
      </footer>

      <BackToTopButton />
      </div>
    </>
    </LazyMotion>
    </MotionConfig>
  );
}
