"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform, type MotionValue } from "framer-motion";
import type { Work } from "@/lib/types";
import BgCanvas from "@/components/particle-bg";
import AuroraCanvas from "@/components/aurora-canvas";

interface ImageItem { id: string; image_url: string; thumb_url: string; }

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
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [works, setWorks] = useState<Work[]>(initialWorks);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"default" | "newest" | "oldest">("default");
  const [lightboxWork, setLightboxWork] = useState<Work | null>(null);
  const [lightboxImages, setLightboxImages] = useState<ImageItem[]>([]);
  const [fullImageIdx, setFullImageIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
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
      if (sectionsRes.ok) setDetailSections(await sectionsRes.json());
      if (worksRes.ok) setWorks(await worksRes.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { const iv = setInterval(refreshData, 300000); return () => clearInterval(iv); }, [refreshData]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshData]);

  // Hide native cursor only on this page
  useEffect(() => {
    document.body.style.cursor = "none";
    document.body.classList.add("home-vignette");
    return () => {
      document.body.style.cursor = "";
      document.body.classList.remove("home-vignette");
    };
  }, []);

  // Cursor — reference-inspired: CSS class toggle + lerp ring
  useEffect(() => {
    if (typeof window === "undefined") return;
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

  // Reveal
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }), { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [works]);

  // Fullscreen keyboard nav
  useEffect(() => {
    if (fullImageIdx === null || !lightboxImages.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && fullImageIdx < lightboxImages.length - 1) { setFullImageIdx((i) => (i ?? 0) + 1); setZoom(1); setPan({ x: 0, y: 0 }); }
      if (e.key === "ArrowLeft" && fullImageIdx > 0) { setFullImageIdx((i) => (i ?? 0) - 1); setZoom(1); setPan({ x: 0, y: 0 }); }
      if (e.key === "Escape") setFullImageIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullImageIdx, lightboxImages]);

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

  const sortLabels: Record<typeof sortMode, string> = { default: "默认排序", newest: "最新优先", oldest: "最早优先" };
  const nextSort = () => {
    setSortMode(sortMode === "default" ? "newest" : sortMode === "newest" ? "oldest" : "default");
  };
  const fullImage = fullImageIdx !== null ? lightboxImages[fullImageIdx] : null;

  const openLightbox = async (work: Work) => {
    setLightboxWork(work);
    const res = await fetch(`/api/works/${work.id}/images`);
    if (res.ok) {
      const data = await res.json();
      setLightboxImages(data.length > 0 ? data : [{ id: "", image_url: work.image_url, thumb_url: work.thumb_url }]);
    }
  };

  const closeAll = () => { setLightboxWork(null); setFullImageIdx(null); setLightboxImages([]); setZoom(1); setPan({ x: 0, y: 0 }); };
  const closeFullscreen = () => { setFullImageIdx(null); setZoom(1); setPan({ x: 0, y: 0 }); };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const portfolioOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  const portfolioBlur = useTransform(scrollYProgress, [0, 0.45], [0, 12]);
  const portfolioFilter = useTransform(portfolioBlur, (v: number) => `blur(${v}px)`);
  const portfolioScale = useTransform(scrollYProgress, [0, 0.45], [1, 0.88]);

  const MAX_INTRO = 10;
  const lineOps: MotionValue<number>[] = [];
  const lineBlurs: MotionValue<number>[] = [];
  const lineScales: MotionValue<number>[] = [];
  const lineFilters: MotionValue<string>[] = [];
  /* eslint-disable react-hooks/rules-of-hooks */
  for (let i = 0; i < MAX_INTRO; i++) {
    const enterStart = 0.04 + i * 0.045;
    const enterEnd = enterStart + 0.08;
    const exitStart = 0.26 + i * 0.045;
    const exitEnd = exitStart + 0.08;
    lineOps.push(useTransform(scrollYProgress, [enterStart, enterEnd, exitStart, exitEnd], [0, 1, 1, 0]));
    const b = useTransform(scrollYProgress, [enterStart, enterEnd, exitStart, exitEnd], [12, 0, 0, 12]);
    lineBlurs.push(b);
    lineScales.push(useTransform(scrollYProgress, [enterStart, enterEnd, exitStart, exitEnd], [0.86, 1, 1, 0.86]));
    lineFilters.push(useTransform(b, (v: number) => `blur(${v}px)`));
  }
  /* eslint-enable react-hooks/rules-of-hooks */

  // Marquee items: repeat tags 6x to ensure infinite scroll
  const marqueeItems = tags.length > 0 ? tags : ["Digital Art", "Character Design", "3D", "Illustration"];

  return (
    <>
      <div ref={cursorRef} className="cursor hidden md:block" />
      <div ref={ringRef} className="cursor-ring hidden md:block" />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-[70] px-6 md:px-12 py-5 flex justify-between items-center bg-bg/50 backdrop-blur-sm">
        <a href="#" onClick={closeAll} className="font-display text-lg tracking-wider text-text">Portfolio</a>
        <div className="flex gap-8 text-xs tracking-[0.25em] uppercase text-text-muted">
          <a href="#works" className="nav-link">作品</a>
          <a href="#about" className="nav-link">关于</a>
          <a href="#contact" className="nav-link">联系</a>
        </div>
      </nav>

      <BgCanvas />

      <div className="relative z-10">
        {/* Hero */}
        <section ref={heroRef} className="hero-noise min-h-screen relative flex flex-col items-center justify-center px-4 overflow-hidden">
          <AuroraCanvas />

          <div className="relative z-10 flex flex-col items-center justify-center w-full">
            {/* Portfolio title — fades out on scroll */}
            <motion.div
              style={{ opacity: portfolioOpacity, scale: portfolioScale, filter: portfolioFilter }}
              className="text-center pointer-events-none"
            >
              <h1 className="font-display text-[clamp(4rem,15vw,12rem)] leading-[0.9] tracking-[-0.04em] text-text whitespace-nowrap">
                <span className="inline-block overflow-hidden"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2,0.9,0.3,1] }} className="inline-block">P</motion.span></span>
                <span className="inline-block overflow-hidden"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2,0.9,0.3,1], delay: 0.12 }} className="inline-block">ortfolio</motion.span></span>
              </h1>
            </motion.div>

            {/* Intro — reveals line by line on scroll, stays visible, fades on exit */}
            {intro && (
              <div className="mt-12 md:mt-16 max-w-2xl mx-auto text-center">
                {(() => {
                  let idx = 0;
                  return intro.split("\n").map((line, i) => {
                    if (!line.trim()) return <br key={i} />;
                    if (idx >= MAX_INTRO) return null;
                    const animIdx = idx++;
                    return (
                      <motion.p
                        key={i}
                        style={{
                          opacity: lineOps[animIdx],
                          scale: lineScales[animIdx],
                          filter: lineFilters[animIdx],
                        }}
                        className="font-display text-xl md:text-2xl text-text-muted leading-relaxed mb-5"
                      >
                        {line.trim()}
                      </motion.p>
                    );
                  });
                })()}
              </div>
            )}
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
      <section className="py-12 md:py-16 border-y border-border/20 overflow-hidden">
        <div className="overflow-hidden">
          <div className="flex animate-[marquee_10s_linear_infinite] md:animate-[marquee_14s_linear_infinite]" style={{ width: "max-content" }}>
            {[0, 1, 2].map((n) => (
              <div key={n} className="flex flex-shrink-0">
                {[0, 1, 2, 3, 4].map((m) => (
                  <span key={`${n}-${m}`} className="font-display italic text-2xl md:text-3xl text-text-muted/25 tracking-wider mx-6 whitespace-nowrap flex-shrink-0">
                    {marqueeItems.map((t, j) => `${t}${j < marqueeItems.length - 1 ? " · " : ""}`)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Works */}
      <section id="works" className="px-4 md:px-6 pt-16 pb-24 max-w-7xl mx-auto">
        <div className="reveal">
          <div className="flex items-center gap-4 mb-4">
            <span className="font-display italic text-accent text-2xl">01</span>
            <div className="divider-line" />
            <span className="text-xs tracking-[0.4em] uppercase text-text-muted">Portfolio</span>
          </div>
          <h2 className="font-display text-2xl md:text-4xl text-accent mb-12">作品集</h2>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-12 reveal">
            <button onClick={() => setActiveTag(null)} className={`px-4 py-1.5 text-[0.65rem] tracking-wider uppercase transition-colors ${activeTag === null ? "text-accent border-b border-accent" : "text-text-muted hover:text-text"}`}>All</button>
            {tags.map((t) => (
              <button key={t} onClick={() => setActiveTag(t)} className={`px-4 py-1.5 text-[0.65rem] tracking-wider uppercase transition-colors ${activeTag === t ? "text-accent border-b border-accent" : "text-text-muted hover:text-text"}`}>{t}</button>
            ))}
            <span className="flex-1" />
            <button onClick={nextSort} className="px-3 py-1.5 text-[0.6rem] tracking-wider uppercase text-text-muted hover:text-accent transition-colors border border-border">
              {sortLabels[sortMode]}
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-text-muted reveal">
            <p>{loadError ? "内容暂时加载失败，请稍后刷新" : "还没有作品"}</p>
            {loadError && (
              <button
                onClick={refreshData}
                className="mt-5 px-5 py-2 border border-border text-xs tracking-wider text-accent hover:bg-accent hover:text-bg transition-colors"
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
                  className={`work-card reveal cursor-pointer group ${colSpan}`}
                  onClick={() => openLightbox(work)}
                  data-hover
                >
                  <div className="overflow-hidden">
                    <Image
                      src={work.thumb_url}
                      alt={work.title}
                      width={1200}
                      height={1600}
                      unoptimized
                      className="max-w-full max-h-[32rem] w-auto h-auto"
                      loading="lazy"
                    />
                  </div>
                  <div className="card-meta">
                    <div className="flex items-center gap-3 text-[0.6rem] tracking-[0.3em] uppercase text-accent-dim">
                      {work.pinned && <span>Featured</span>}
                      {work.work_date && <span>{work.work_date}</span>}
                    </div>
                    <h3 className="font-display text-lg md:text-xl text-text mt-1 leading-tight group-hover:text-accent transition-colors">{work.title}</h3>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-text-muted tracking-[0.15em]">
                      {work.tags.slice(0, 3).map((t) => <span key={t} className="text-accent-dim">{t}</span>)}
                      {(work.image_count || 1) > 1 && <span className="text-text-muted/50">{work.image_count} 张</span>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* About */}
      {detailSections.length > 0 && (
        <section id="about" className="px-4 md:px-6 pb-16 max-w-7xl mx-auto">
          <div className="reveal">
            <div className="flex items-center gap-4 mb-4">
              <span className="font-display italic text-accent text-2xl">02</span>
              <div className="divider-line" />
              <span className="text-xs tracking-[0.4em] uppercase text-text-muted">About</span>
            </div>
            <h2 className="font-display text-2xl md:text-4xl text-accent mb-10">详细介绍</h2>
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
                    className="w-full flex items-center justify-between py-4 text-left group"
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

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxWork && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[80] bg-bg flex flex-col" onClick={closeAll}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <div>
                <h2 className="font-display text-xl text-text">{lightboxWork.title}</h2>
                <div className="flex items-center gap-3 mt-1">
                  {lightboxWork.work_date && <span className="text-xs text-accent-dim">{lightboxWork.work_date}</span>}
                  {lightboxWork.tags.map((t) => <span key={t} className="text-xs text-text-muted/60">{t}</span>)}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link href={`/work/${lightboxWork.id}`} className="text-xs tracking-[0.2em] uppercase text-accent hover:text-text transition-colors">
                  查看详情
                </Link>
                <button onClick={closeAll} className="text-text-muted hover:text-text transition-colors p-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-8" onClick={(e) => e.stopPropagation()}>
              {lightboxWork.description && <p className="text-text-muted text-sm max-w-2xl mb-10 leading-relaxed">{lightboxWork.description}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl mx-auto pb-8">
                {lightboxImages.map((img, i) => (
                  <motion.div
                    key={img.id || i}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...spring, delay: i * 0.04 }}
                    className="cursor-zoom-in bg-surface overflow-hidden group"
                    onClick={(e) => { e.stopPropagation(); setFullImageIdx(i); }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <Image src={img.image_url} alt="" width={1200} height={1600} unoptimized className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen with nav */}
      <AnimatePresence>
        {fullImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-bg/96 flex items-center justify-center" style={{ touchAction: "none" }} onClick={closeFullscreen}>
            <button onClick={(e) => { e.stopPropagation(); closeAll(); }} className="absolute top-6 left-6 text-text-muted hover:text-text z-20 p-2 text-xs tracking-[0.3em] uppercase">返回作品集</button>
            <button onClick={(e) => { e.stopPropagation(); closeFullscreen(); }} className="absolute top-6 right-6 text-text-muted hover:text-text z-20 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>

             {fullImageIdx !== null && fullImageIdx > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setFullImageIdx((i) => (i ?? 0) - 1); resetView(); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text z-20 p-4"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="15 18 9 12 15 6" /></svg></button>
            )}
            {fullImageIdx !== null && fullImageIdx < lightboxImages.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); setFullImageIdx((i) => (i ?? 0) + 1); resetView(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text z-20 p-4"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="9 18 15 12 9 6" /></svg></button>
            )}

            <motion.img
              key={fullImageIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              src={fullImage.image_url}
              alt={lightboxWork?.title ?? ""}
              className="max-w-[94vw] max-h-[94vh] object-contain select-none"
              style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, cursor: zoom > 1 ? "grab" : "zoom-in" }}
              onTouchStart={(e) => {
                const t = e.touches[0];
                touchRef.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={(e) => {
                if (!touchRef.current || zoom > 1) return;
                const t = e.changedTouches[0];
                const dx = t.clientX - touchRef.current.x;
                const dy = t.clientY - touchRef.current.y;
                touchRef.current = null;
                if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
                e.stopPropagation();
                if (dx < 0 && fullImageIdx !== null && fullImageIdx < lightboxImages.length - 1) { setFullImageIdx((i) => (i ?? 0) + 1); resetView(); }
                if (dx > 0 && fullImageIdx !== null && fullImageIdx > 0) { setFullImageIdx((i) => (i ?? 0) - 1); resetView(); }
              }}
              onWheel={(e) => { e.stopPropagation(); setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.001))); }}
              onDoubleClick={(e) => { e.stopPropagation(); setZoom((z) => z > 1 ? 1 : 2); setPan({ x: 0, y: 0 }); }}
              onMouseDown={(e) => {
                if (zoom <= 1) return;
                e.stopPropagation(); e.preventDefault();
                dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
                (e.target as HTMLElement).style.cursor = "grabbing";
                const onMove = (ev: MouseEvent) => {
                  if (!dragRef.current) return;
                  setPan({ x: dragRef.current.px + (ev.clientX - dragRef.current.sx) / zoom, y: dragRef.current.py + (ev.clientY - dragRef.current.sy) / zoom });
                };
                const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />

            {fullImageIdx !== null && lightboxImages.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-text-muted/50 tracking-wider">{fullImageIdx + 1} / {lightboxImages.length}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact */}
      <section id="contact" className="px-4 md:px-6 py-16 md:py-24 border-t border-border/20">
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
