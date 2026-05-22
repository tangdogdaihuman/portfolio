"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Work {
  id: string; title: string; description: string;
  image_url: string; thumb_url: string; tags: string[];
  work_date: string; image_count: number; pinned: boolean;
}
interface ImageItem { id: string; image_url: string; thumb_url: string; }

const spring = { type: "spring" as const, damping: 28, stiffness: 200, mass: 0.8 };
const springSlow = { type: "spring" as const, damping: 32, stiffness: 160, mass: 1 };

interface Section { id: string; title: string; content: string; }

export default function HomeClient() {
  const [intro, setIntro] = useState("");
  const [detailSections, setDetailSections] = useState<Section[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [lightboxWork, setLightboxWork] = useState<Work | null>(null);
  const [lightboxImages, setLightboxImages] = useState<ImageItem[]>([]);
  const [fullImageIdx, setFullImageIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [introRes, sectionsRes, worksRes] = await Promise.all([fetch("/api/intro"), fetch("/api/detail-sections"), fetch("/api/works")]);
      if (introRes.ok) setIntro((await introRes.json()).content || "");
      if (sectionsRes.ok) setDetailSections(await sectionsRes.json());
      if (worksRes.ok) setWorks(await worksRes.json());
    } catch {} finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }, []);

  // Hide native cursor only on this page
  useEffect(() => {
    document.body.style.cursor = "none";
    return () => { document.body.style.cursor = ""; };
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
      if (e.key === "ArrowRight" && fullImageIdx < lightboxImages.length - 1) setFullImageIdx((i) => (i ?? 0) + 1);
      if (e.key === "ArrowLeft" && fullImageIdx > 0) setFullImageIdx((i) => (i ?? 0) - 1);
      if (e.key === "Escape") setFullImageIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullImageIdx, lightboxImages]);

  const tags = [...new Set(works.flatMap((w) => w.tags))];
  const filtered = activeTag ? works.filter((w) => w.tags.includes(activeTag)) : works;
  const fullImage = fullImageIdx !== null ? lightboxImages[fullImageIdx] : null;

  const openLightbox = async (work: Work) => {
    setLightboxWork(work);
    const res = await fetch(`/api/works/${work.id}/images`);
    if (res.ok) {
      const data = await res.json();
      setLightboxImages(data.length > 0 ? data : [{ id: "", image_url: work.image_url, thumb_url: work.thumb_url }]);
    }
  };

  const closeAll = () => { setLightboxWork(null); setFullImageIdx(null); setLightboxImages([]); };

  // Marquee items: repeat tags 6x to ensure infinite scroll
  const marqueeItems = tags.length > 0 ? tags : ["Digital Art", "Character Design", "3D", "Illustration"];

  return (
    <>
      <div ref={cursorRef} className="cursor hidden md:block" />
      <div ref={ringRef} className="cursor-ring hidden md:block" />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-40 px-6 md:px-12 py-5 flex justify-between items-center bg-bg/50 backdrop-blur-sm">
        <a href="#" className="font-display text-lg tracking-wider text-text">Portfolio</a>
        <div className="flex gap-8 text-xs tracking-[0.25em] uppercase text-text-muted">
          <a href="#works" className="nav-link">作品</a>
          <a href="#about" className="nav-link">关于</a>
          <a href="#contact" className="nav-link">联系</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center relative px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} className="text-center">
          {loading ? (
            <div className="text-text-muted/20 text-lg">...</div>
          ) : intro ? (
            <div className="max-w-2xl mx-auto reveal">
              <div className="divider-line mx-auto mb-8" />
              <p className="text-[0.6rem] tracking-[0.35em] uppercase text-accent-dim mb-6 font-display">About</p>
              {intro.split("\n").map((p, i) => p.trim() ? <p key={i} className="font-display text-xl md:text-2xl text-text-muted leading-relaxed mb-5">{p}</p> : null)}
            </div>
          ) : (
            <div>
              <h1 className="font-display text-[clamp(3.5rem,14vw,12rem)] leading-[0.9] tracking-[-0.04em] text-text">
                <span className="block overflow-hidden"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2,0.9,0.3,1] }} className="inline-block">P</motion.span></span>
                <span className="block overflow-hidden"><motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2,0.9,0.3,1], delay: 0.12 }} className="inline-block">ortfolio</motion.span></span>
              </h1>
            </div>
          )}
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="absolute bottom-12 text-center">
          <p className="text-[0.6rem] tracking-[0.35em] uppercase text-text-muted mb-4">Scroll</p>
          <span className="scroll-line" />
        </motion.div>
      </section>

      {/* Marquee - infinite loop via CSS animation */}
      <section className="py-12 md:py-16 border-y border-border/20 overflow-hidden">
        <div className="flex whitespace-nowrap animate-[scroll_60s_linear_infinite]">
          {[...Array(8)].map((_, i) => (
            <span key={i} className="font-display italic text-2xl md:text-3xl text-text-muted/25 tracking-wider mx-6 flex-shrink-0">
              {marqueeItems.map((t, j) => `${t}${j < marqueeItems.length - 1 || i < 7 ? " · " : ""}`)}
            </span>
          ))}
        </div>
      </section>

      {/* Works */}
      <section id="works" className="px-4 md:px-6 pt-16 pb-24 max-w-7xl mx-auto">
        <div className="reveal">
          <div className="flex items-center gap-4 mb-4">
            <span className="font-display italic text-accent text-2xl">01</span>
            <div className="divider-line" />
            <span className="text-xs tracking-[0.4em] uppercase text-text-muted">Selected Works</span>
          </div>
          <h2 className="font-display text-2xl md:text-4xl text-accent mb-12">精选作品</h2>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-12 reveal">
            <button onClick={() => setActiveTag(null)} className={`px-4 py-1.5 text-[0.65rem] tracking-wider uppercase transition-colors ${activeTag === null ? "text-accent border-b border-accent" : "text-text-muted hover:text-text"}`}>All</button>
            {tags.map((t) => (
              <button key={t} onClick={() => setActiveTag(t)} className={`px-4 py-1.5 text-[0.65rem] tracking-wider uppercase transition-colors ${activeTag === t ? "text-accent border-b border-accent" : "text-text-muted hover:text-text"}`}>{t}</button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-text-muted reveal">还没有作品</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
            {filtered.map((work, i) => {
              const span = i % 3 === 0 ? "md:col-span-7" : "md:col-span-5";
              return (
                <motion.div
                  key={work.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ ...springSlow, delay: i * 0.06 }}
                  className={`work-card reveal cursor-pointer group ${span}`}
                  onClick={() => openLightbox(work)}
                  data-hover
                  whileHover={{ scale: 1.02 }}
                >
                  <img src={work.thumb_url} alt={work.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  <div className="card-overlay">
                    {work.pinned && <span className="text-[10px] tracking-widest uppercase text-accent mb-2">Featured</span>}
                    <h3 className="font-display text-xl md:text-2xl text-text">{work.title}</h3>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {work.work_date && <span className="text-xs text-text-muted">{work.work_date}</span>}
                      {work.tags.slice(0, 2).map((t) => <span key={t} className="text-xs text-accent-dim tracking-wider">{t}</span>)}
                      {(work.image_count || 1) > 1 && <span className="text-xs text-text-muted/50">{work.image_count} 张</span>}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={closeAll}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <div>
                <h2 className="font-display text-xl text-text">{lightboxWork.title}</h2>
                <div className="flex items-center gap-3 mt-1">
                  {lightboxWork.work_date && <span className="text-xs text-accent-dim">{lightboxWork.work_date}</span>}
                  {lightboxWork.tags.map((t) => <span key={t} className="text-xs text-text-muted/60">{t}</span>)}
                </div>
              </div>
              <button onClick={closeAll} className="text-text-muted hover:text-text transition-colors p-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
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
                    <img src={img.thumb_url} alt="" className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-bg/98 flex items-center justify-center" onClick={() => setFullImageIdx(null)}>
            <button onClick={() => setFullImageIdx(null)} className="absolute top-6 right-6 text-text-muted hover:text-text z-20 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>

            {fullImageIdx !== null && fullImageIdx > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setFullImageIdx((i) => (i ?? 0) - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text z-20 p-4"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="15 18 9 12 15 6" /></svg></button>
            )}
            {fullImageIdx !== null && fullImageIdx < lightboxImages.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); setFullImageIdx((i) => (i ?? 0) + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text z-20 p-4"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polyline points="9 18 15 12 9 6" /></svg></button>
            )}

            <motion.img
              key={fullImageIdx}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
              src={fullImage.image_url}
              alt={lightboxWork?.title ?? ""}
              className="max-w-[94vw] max-h-[94vh] object-contain"
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
    </>
  );
}
