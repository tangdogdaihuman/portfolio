"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform, type MotionValue } from "framer-motion";
import type { Work } from "@/lib/types";
import BgCanvas from "@/components/particle-bg";
import AuroraCanvas from "@/components/aurora-canvas";

const spring = { type: "spring" as const, damping: 28, stiffness: 200, mass: 0.8 };
const springSlow = { type: "spring" as const, damping: 32, stiffness: 160, mass: 1 };

interface Section { id: string; title: string; content: string; }

export default function HomeClient({
  initialIntro,
  initialWorks,
  initialSections,
  initialLoadError,
}: {
  initialIntro: string;
  initialWorks: Work[];
  initialSections: Section[];
  initialLoadError: boolean;
}) {
  const [intro, setIntro] = useState(initialIntro);
  const [detailSections, setDetailSections] = useState<Section[]>(initialSections);
  const [loadError, setLoadError] = useState(initialLoadError);
  const [loadingWorks, setLoadingWorks] = useState(initialWorks.length === 0 && !initialLoadError);
  const [expandedSection, setExpandedSection] = useState<string | null>(initialSections[0]?.id ?? null);
  const [works, setWorks] = useState<Work[]>(initialWorks);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"default" | "newest" | "oldest">("default");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"works" | "about" | "contact">("works");
  const [thumbReady, setThumbReady] = useState<Record<string, true>>({});
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const refreshData = useCallback(async () => {
    try {
      const [introRes, sectionsRes, worksRes] = await Promise.all([fetch("/api/intro"), fetch("/api/detail-sections"), fetch("/api/works")]);
      if (!introRes.ok || !sectionsRes.ok || !worksRes.ok) {
        throw new Error("refresh failed");
      }
      if (introRes.ok) setIntro((await introRes.json()).content || "");
      if (sectionsRes.ok) {
        const nextSections = await sectionsRes.json() as Section[];
        setDetailSections(nextSections);
        setExpandedSection((current) => {
          if (nextSections.length === 0) return null;
          if (!current) return nextSections[0].id;
          return nextSections.some((section) => section.id === current) ? current : nextSections[0].id;
        });
      }
      if (worksRes.ok) setWorks(await worksRes.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingWorks(false);
    }
  }, []);

  useEffect(() => { const iv = setInterval(refreshData, 300000); return () => clearInterval(iv); }, [refreshData]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshData]);

  // Enable vignette always; hide native cursor only for fine pointer devices.
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

  // Cursor — reference-inspired: CSS class toggle + lerp ring
  useEffect(() => {
    if (typeof window === "undefined") return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return;
    const cursor = cursorRef.current, ring = ringRef.current;
    if (!cursor || !ring) return;
    let mx = 0, my = 0, rx = 0, ry = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      cursor.style.left = mx + "px";
      cursor.style.top = my + "px";
      const hovering = (e.target as HTMLElement).closest(".work-card, a, button, [data-hover]");
      if (hovering) { cursor.classList.add("hover"); ring.classList.add("hover"); }
      else { cursor.classList.remove("hover"); ring.classList.remove("hover"); }
    };
    const animate = () => {
      rx += (mx - rx) * 0.15;
      ry += (my - ry) * 0.15;
      ring.style.left = rx + "px";
      ring.style.top = ry + "px";
      raf = requestAnimationFrame(animate);
    };
    let raf = requestAnimationFrame(animate);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    const sections = ["works", "about", "contact"] as const;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id as "works" | "about" | "contact");
        }
      },
      { threshold: [0.25, 0.45, 0.65], rootMargin: "-22% 0px -55% 0px" }
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [works.length, detailSections.length]);

  // Reveal
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }), { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [works]);

  const tags = [...new Set(works.flatMap((w) => w.tags))];
  const filtered = activeTag ? works.filter((w) => w.tags.includes(activeTag)) : works;
  const sorted = (() => {
    if (sortMode === "default") return filtered;
    const byDate = [...filtered].sort((a, b) => {
      const da = a.work_date || "";
      const db = b.work_date || "";
      return sortMode === "newest" ? db.localeCompare(da) : da.localeCompare(db);
    });
    return byDate;
  })();

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

  const MAX_INTRO = 10;
  const exitOps: MotionValue<number>[] = [];
  const exitScales: MotionValue<number>[] = [];
  const exitFilters: MotionValue<string>[] = [];
  /* eslint-disable react-hooks/rules-of-hooks */
  for (let i = 0; i < MAX_INTRO; i++) {
    const exitStart = 0.4 + i * 0.04;
    const exitEnd = exitStart + 0.12;
    exitOps.push(useTransform(scrollYProgress, [0, exitStart, exitEnd], [1, 1, 0]));
    const b = useTransform(scrollYProgress, [0, exitStart, exitEnd], [0, 0, 8]);
    exitScales.push(useTransform(scrollYProgress, [0, exitStart, exitEnd], [1, 1, 0.9]));
    exitFilters.push(useTransform(b, (v: number) => `blur(${v}px)`));
  }
  /* eslint-enable react-hooks/rules-of-hooks */

  // Marquee items: repeat tags 6x to ensure infinite scroll
  const marqueeItems = tags.length > 0 ? tags : ["Digital Art", "Character Design", "3D", "Illustration"];
  const marqueeLabel = `${marqueeItems.join(" · ")} ·`;
  const navClass = (id: "works" | "about" | "contact") => `nav-link ${activeSection === id ? "nav-link-active text-text" : ""}`;

  return (
    <>
      <div ref={cursorRef} className="cursor hidden md:block" />
      <div ref={ringRef} className="cursor-ring hidden md:block" />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-[70] px-4 md:px-10 py-3.5 md:py-4.5 flex justify-between items-center bg-bg/70 backdrop-blur-md border-b border-border/30">
          <a href="#" className="font-display text-lg tracking-wider text-text">Portfolio</a>
          <div className="hidden md:flex gap-7 text-[0.67rem] tracking-[0.22em] uppercase text-text-muted">
            <a href="#works" className={navClass("works")}>作品</a>
            <a href="#about" className={navClass("about")}>关于</a>
            <a href="#contact" className={navClass("contact")}>联系</a>
          </div>
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
        </nav>

      <BgCanvas />

      <div className="relative z-10">
        {/* Hero */}
        <section ref={heroRef} className="hero-noise min-h-svh md:min-h-screen relative flex flex-col items-center justify-center px-4 overflow-hidden">
          <AuroraCanvas />
          <div className="hero-contrast-scrim absolute inset-0 z-[1] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-6xl mx-auto">
            {/* Portfolio title — fades out on scroll */}
            <motion.div
              style={{ opacity: portfolioOpacity, scale: portfolioScale, filter: portfolioFilter }}
              className="text-center pointer-events-none"
            >
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.2, 0.9, 0.3, 1] }}
                className="text-xs text-accent-dim uppercase mb-6 tracking-[0.2em]"
              >
                CG Artist Portfolio
              </motion.p>
              <h1 className="font-display leading-[1.02] text-text">
                <span className="block overflow-hidden pb-[0.06em]">
                  <motion.span
                    initial={{ y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.95, ease: [0.2, 0.9, 0.3, 1] }}
                    className="inline-block text-[clamp(2.8rem,9vw,6.2rem)]"
                  >
                    唐子航
                  </motion.span>
                </span>
                <span className="block overflow-hidden mt-1.5 pb-[0.14em]">
                  <motion.span
                    initial={{ y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.95, ease: [0.2, 0.9, 0.3, 1], delay: 0.12 }}
                    className="inline-block text-[clamp(1.05rem,3.8vw,2.25rem)] text-accent"
                  >
                    Tang Zihang CG Portfolio
                  </motion.span>
                </span>
              </h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
                className="mt-4 text-[0.7rem] uppercase tracking-[0.18em] text-text-muted"
              >
                Hard Surface / Stylized Character / Game Art
              </motion.p>
            </motion.div>

            {/* Intro — visible on load, lines exit one by one on scroll */}
            {intro && (
               <div className="mt-6 max-w-[46rem] mx-auto text-center px-3">
                {(() => {
                  let idx = 0;
                  return intro.split("\n").map((line, i) => {
                    if (!line.trim()) return <br key={i} />;
                    const delay = idx * 0.08;
                    const exitIdx = Math.min(idx, MAX_INTRO - 1);
                    idx++;
                    return (
                      <motion.div
                        key={i}
                        style={{ opacity: exitOps[exitIdx], scale: exitScales[exitIdx], filter: exitFilters[exitIdx] }}
                      >
                        <motion.p
                          initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          transition={{ duration: 0.7, delay, ease: [0.2, 0.9, 0.3, 1] }}
                          className="text-[clamp(0.95rem,2vw,1.12rem)] text-text-muted leading-[1.85] mb-3.5"
                        >
                          {line.trim()}
                        </motion.p>
                      </motion.div>
                    );
                  });
                })()}
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.2, 0.9, 0.3, 1] }}
              className="mt-7 flex items-center gap-3"
            >
              <a href="#works" className="min-h-11 inline-flex items-center justify-center px-5 py-2.5 text-xs uppercase text-text border border-border/70 hover:border-accent hover:text-accent transition-colors">
                浏览作品
              </a>
              <a href="#contact" className="min-h-11 inline-flex items-center justify-center px-5 py-2.5 text-xs uppercase text-text-muted border border-border/50 hover:text-text transition-colors">
                联系我
              </a>
            </motion.div>
          </div>

          {/* Scroll indicator — fades with Portfolio */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
            <motion.div
              style={{ opacity: portfolioOpacity }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center"
            >
              <p className="text-[0.6rem] tracking-[0.35em] uppercase text-text-muted mb-4">Scroll</p>
              <span className="scroll-line" />
            </motion.div>
          </motion.div>
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
        <div className="reveal">
          <div className="flex items-center gap-4 mb-4">
            <span className="font-display italic text-accent text-2xl">01</span>
            <div className="divider-line" />
            <span className="text-xs tracking-[0.4em] uppercase text-text-muted">Portfolio</span>
          </div>
          <h2 className="font-display text-2xl md:text-4xl text-accent mb-10">作品集</h2>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:gap-2.5 mb-10 reveal">
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
            {Array.from({ length: 4 }).map((_, i) => {
              const colSpan = i % 3 === 0 ? "md:col-span-8" : i % 3 === 1 ? "md:col-span-5" : "md:col-span-7";
              return (
                <div key={`skeleton-${i}`} className={`reveal ${colSpan}`}>
                  <div className="bg-surface h-64 md:h-80 animate-pulse" />
                  <div className="mt-3 space-y-2">
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
                onClick={refreshData}
                className="mt-5 px-5 py-2 border border-border text-xs tracking-[0.16em] text-accent hover:bg-accent hover:text-bg transition-colors"
              >
                重试加载
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
            {sorted.map((work, i) => {
              const w = work.size_weight ?? 1;
              const colSpan = w >= 1.5 ? "md:col-span-8" : w >= 1.0 ? (i % 2 === 0 ? "md:col-span-7" : "md:col-span-5") : "md:col-span-4";
              return (
                <motion.div
                  key={work.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ ...springSlow, delay: (i % 4) * 0.08 }}
                  className={`work-card reveal group ${colSpan}`}
                >
                  <Link href={`/work/${work.id}`} className="block" data-hover>
                    <div className="overflow-hidden">
                      <Image
                        src={work.thumb_url}
                        alt={work.title}
                        width={1200}
                        height={1600}
                        unoptimized
                        className={`work-thumb ${thumbReady[work.id] ? "work-thumb-ready" : ""} block mx-auto w-full h-auto max-h-[32rem] object-contain object-center`}
                        sizes="(max-width: 768px) 92vw, (max-width: 1280px) 50vw, 36vw"
                        priority={i < 2}
                        loading={i < 2 ? "eager" : "lazy"}
                        onLoad={() => setThumbReady((current) => (current[work.id] ? current : { ...current, [work.id]: true }))}
                      />
                    </div>
                    <div className="card-meta">
                      <div className="flex items-center gap-2.5 text-[0.58rem] tracking-[0.28em] uppercase text-accent-dim">
                        {work.pinned && <span className="text-accent">Featured</span>}
                        {work.work_date && <span>{work.work_date}</span>}
                      </div>
                      <h3 className="font-display text-[1.15rem] md:text-[1.45rem] text-text mt-1 leading-[1.1] group-hover:text-accent transition-colors">{work.title}</h3>
                      <div className="flex items-center gap-2.5 flex-wrap text-[0.7rem] text-text-muted tracking-[0.11em] mt-1.5">
                        {work.tags.slice(0, 2).map((t) => <span key={t} className="text-accent-dim/90">{t}</span>)}
                        <span className="text-text-muted/60">{(work.image_count || 1) > 1 ? `${work.image_count} 张图集` : "单图展示"}</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* About */}
      {detailSections.length > 0 && (
        <section id="about" className="scroll-mt-24 md:scroll-mt-28 px-4 md:px-6 pb-14 md:pb-16 max-w-7xl mx-auto">
          <div className="reveal">
            <div className="flex items-center gap-4 mb-4">
              <span className="font-display italic text-accent text-2xl">02</span>
              <div className="divider-line" />
              <span className="text-xs tracking-[0.4em] uppercase text-text-muted">About</span>
            </div>
            <h2 className="font-display text-2xl md:text-4xl text-accent mb-8 md:mb-10">详细介绍</h2>
          </div>
          <div className="max-w-2xl space-y-2">
            {detailSections.map((s, i) => {
              const isOpen = expandedSection === s.id;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: i * 0.06 }}
                  className="border-b border-border/30 overflow-hidden"
                  whileHover={{ scale: 1.005 }}
                >
                  <button
                    onClick={() => setExpandedSection(isOpen ? null : s.id)}
                    aria-expanded={isOpen}
                    aria-controls={`about-panel-${s.id}`}
                    className="w-full min-h-11 flex items-center justify-between py-4 text-left group"
                    data-hover
                  >
                    <span className="font-display text-lg text-text-muted group-hover:text-accent transition-colors duration-300">{s.title}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ type: "spring", damping: 20, stiffness: 200 }}
                      className="text-accent-dim text-lg flex-shrink-0 ml-4"
                    >
                      +
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`about-panel-${s.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.2, 0.9, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pb-5 text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                          {s.content}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Contact */}
      <section id="contact" className="scroll-mt-24 md:scroll-mt-28 px-4 md:px-6 py-14 md:py-20 border-t border-border/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-12 gap-12">
            <div className="md:col-span-7 reveal">
              <div className="flex items-center gap-4 mb-4">
                <span className="font-display italic text-accent text-2xl">03</span>
                <div className="divider-line" />
                <span className="text-xs tracking-[0.4em] uppercase text-text-muted">Contact</span>
              </div>
              <h2 className="font-display text-base md:text-xl text-accent leading-[0.95] mb-10">
                联系方式
              </h2>
              <div className="space-y-3 text-text-muted text-sm">
                <p><span className="text-text-muted/60">邮箱：</span><a href="mailto:1193662756@qq.com" className="nav-link inline text-text-muted hover:text-accent transition-colors">1193662756@qq.com</a></p>
                <p><span className="text-text-muted/60">微信号：</span><span className="nav-link cursor-default">T15918177465</span></p>
                <p><span className="text-text-muted/60">电话：</span><span className="nav-link cursor-default">15918177465</span></p>
              </div>
            </div>
            <div className="md:col-span-5 md:pt-24">
              <div className="space-y-8">
                <div className="reveal">
                  <div className="text-xs tracking-[0.3em] uppercase text-text-muted mb-3">Follow</div>
                  <div className="space-y-3">
                    <a href="https://github.com/tangdogdaihuman" target="_blank" rel="noopener noreferrer" className="nav-link font-display text-lg text-text-muted hover:text-accent transition-colors block">GitHub ↗</a>
                    <a href="https://www.artstation.com/uuey7" target="_blank" rel="noopener noreferrer" className="nav-link font-display text-lg text-text-muted hover:text-accent transition-colors block">ArtStation ↗</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-10 text-center">
        <div className="divider-line mx-auto mb-6" />
        <p className="text-[0.6rem] tracking-[0.3em] uppercase text-text-muted/30">&copy; {new Date().getFullYear()} · All Rights Reserved</p>
      </footer>
      </div>
    </>
  );
}
