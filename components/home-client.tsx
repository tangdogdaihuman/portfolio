"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Work {
  id: string; title: string; description: string;
  image_url: string; thumb_url: string; tags: string[];
  work_date: string; image_count: number; pinned: boolean;
}
interface ImageItem { id: string; image_url: string; thumb_url: string; }

export default function HomeClient() {
  const [intro, setIntro] = useState("");
  const [works, setWorks] = useState<Work[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [lightboxWork, setLightboxWork] = useState<Work | null>(null);
  const [lightboxImages, setLightboxImages] = useState<ImageItem[]>([]);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovering, setHovering] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const [introRes, worksRes] = await Promise.all([fetch("/api/intro"), fetch("/api/works")]);
      if (introRes.ok) setIntro((await introRes.json()).content || "");
      if (worksRes.ok) setWorks(await worksRes.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }, [fetchData]);

  // GPU-accelerated cursor via rAF
  useEffect(() => {
    let mx = 0, my = 0;
    const cursor = cursorRef.current, ring = ringRef.current;
    if (!cursor || !ring) return;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    const tick = () => {
      cursor.style.transform = `translate3d(${mx - 4}px,${my - 4}px,0)`;
      ring.style.transform = `translate3d(${mx - 20}px,${my - 20}px,0)`;
      rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(rafRef.current); };
  }, []);

  // Reveal on scroll
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }), { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [works]);

  const tags = [...new Set(works.flatMap((w) => w.tags))];
  const filtered = activeTag ? works.filter((w) => w.tags.includes(activeTag)) : works;

  const openLightbox = async (work: Work) => {
    setLightboxWork(work);
    const res = await fetch(`/api/works/${work.id}/images`);
    if (res.ok) {
      const data = await res.json();
      setLightboxImages(data.length > 0 ? data : [{ id: "", image_url: work.image_url, thumb_url: work.thumb_url }]);
    }
  };

  const closeLightbox = () => { setLightboxWork(null); setFullImage(null); setLightboxImages([]); };

  return (
    <>
      {/* Cursor - GPU transform based */}
      <div ref={cursorRef} className={`fixed top-0 left-0 w-1.5 h-1.5 bg-accent rounded-full pointer-events-none z-[9999] will-change-transform hidden md:block ${hovering ? "scale-0" : ""} transition-transform duration-150`} />
      <div ref={ringRef} className={`fixed top-0 left-0 w-10 h-10 border border-accent rounded-full pointer-events-none z-[9998] will-change-transform hidden md:block transition-all duration-400 ${hovering ? "!w-20 !h-20 !border-text" : ""}`} />

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center relative px-4">
        <div className="text-center">
          {loading ? (
            <div className="text-text-muted/20 text-lg">...</div>
          ) : intro ? (
            <div className="max-w-2xl mx-auto reveal">
              <div className="divider-line mx-auto mb-8" />
              <p className="text-[0.6rem] tracking-[0.35em] uppercase text-accent-dim mb-6 font-display">About</p>
              {intro.split("\n").map((p, i) =>
                p.trim() ? <p key={i} className="font-display text-xl md:text-2xl text-text-muted leading-relaxed mb-5">{p}</p> : null
              )}
            </div>
          ) : (
            <div>
              <h1 className="font-display text-[clamp(3.5rem,14vw,12rem)] leading-[0.9] tracking-[-0.04em] text-text">
                <span className="block overflow-hidden"><span className="inline-block animate-[lineIn_1.2s_cubic-bezier(.2,.9,.3,1)_forwards]" style={{ transform: "translateY(110%)" }}>P</span></span>
                <span className="block overflow-hidden"><span className="inline-block animate-[lineIn_1.2s_cubic-bezier(.2,.9,.3,1)_forwards]" style={{ animationDelay: "0.15s", transform: "translateY(110%)" }}>ortfolio</span></span>
              </h1>
            </div>
          )}
        </div>
        <div className="absolute bottom-12 text-center">
          <p className="text-[0.6rem] tracking-[0.35em] uppercase text-text-muted mb-4">Scroll</p>
          <span className="scroll-line" />
        </div>
      </section>

      {/* Marquee */}
      <section className="py-12 md:py-16 border-y border-border/20 overflow-hidden">
        <div className="whitespace-nowrap animate-[scroll_40s_linear_infinite]">
          {[...Array(4)].map((_, i) => (
            <span key={i} className="inline-block font-display italic text-2xl md:text-3xl text-text-muted/30 tracking-wider mx-8 md:mx-16">
              {tags.length > 0 ? tags.map((t, j) => <span key={j} className="mx-6">{t}{j < tags.length - 1 || i < 3 ? " · " : ""}</span>) : "Digital Art · Character Design · 3D · Illustration"}
            </span>
          ))}
        </div>
      </section>

      {/* Works */}
      <section className="px-4 md:px-6 pt-16 pb-24 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-12 reveal">
          <span className="font-display italic text-accent text-xl">01</span>
          <div className="divider-line" />
          <span className="text-[0.65rem] tracking-[0.35em] uppercase text-text-muted">Selected Works</span>
        </div>

        {/* Tag filter */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filtered.map((work) => (
              <div
                key={work.id}
                className="work-card reveal cursor-pointer img-frame group"
                onClick={() => openLightbox(work)}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
              >
                <img src={work.thumb_url} alt={work.title} className="w-full h-full object-cover" />
                <div className="card-overlay">
                  {work.pinned && <span className="text-[10px] tracking-widest uppercase text-accent mb-2">Featured</span>}
                  <h3 className="font-display text-xl md:text-2xl text-text">{work.title}</h3>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {work.work_date && <span className="text-xs text-text-muted">{work.work_date}</span>}
                    {work.tags.slice(0, 2).map((t) => <span key={t} className="text-xs text-accent-dim tracking-wider">{t}</span>)}
                    {(work.image_count || 1) > 1 && <span className="text-xs text-text-muted/50">{work.image_count} 张</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* About / Intro */}
      {intro && (
        <section className="px-4 md:px-6 pb-16 max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-10 reveal">
            <span className="font-display italic text-accent text-xl">02</span>
            <div className="divider-line" />
            <span className="text-[0.65rem] tracking-[0.35em] uppercase text-text-muted">About</span>
          </div>
          <div className="max-w-2xl reveal">
            {intro.split("\n").map((p, i) =>
              p.trim() ? <p key={i} className="font-display text-xl text-text-muted leading-relaxed mb-5">{p}</p> : null
            )}
          </div>
        </section>
      )}

      {/* Lightbox gallery */}
      {lightboxWork && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col" onClick={closeLightbox}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-display text-xl text-text">{lightboxWork.title}</h2>
              <div className="flex items-center gap-3 mt-1">
                {lightboxWork.work_date && <span className="text-xs text-accent-dim">{lightboxWork.work_date}</span>}
                {lightboxWork.tags.map((t) => <span key={t} className="text-xs text-text-muted/60">{t}</span>)}
              </div>
            </div>
            <button onClick={closeLightbox} className="text-text-muted hover:text-text transition-colors p-2"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>

          {/* Description + image grid */}
          <div className="flex-1 overflow-y-auto px-6 py-8" onClick={(e) => e.stopPropagation()}>
            {lightboxWork.description && (
              <p className="text-text-muted text-sm max-w-2xl mb-10 leading-relaxed">{lightboxWork.description}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl mx-auto pb-8">
              {lightboxImages.map((img, i) => (
                <div
                  key={img.id || i}
                  className="cursor-zoom-in bg-surface overflow-hidden group"
                  onClick={() => setFullImage(img.image_url)}
                >
                  <img
                    src={img.thumb_url}
                    alt={`${lightboxWork.title} ${i + 1}`}
                    className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen single image */}
      {fullImage && (
        <div className="fixed inset-0 z-[60] bg-bg/98 flex items-center justify-center cursor-zoom-out" onClick={() => setFullImage(null)}>
          <button onClick={() => setFullImage(null)} className="absolute top-6 right-6 text-text-muted hover:text-text z-10 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          <img src={fullImage} alt="" className="max-w-[94vw] max-h-[94vh] object-contain animate-fade-up" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Contact */}
      <section className="px-4 md:px-6 py-16 md:py-24 border-t border-border/20">
        <div className="max-w-2xl mx-auto text-center reveal">
          <div className="flex items-center justify-center gap-4 mb-10">
            <span className="font-display italic text-accent text-xl">03</span>
            <div className="divider-line" />
            <span className="text-[0.65rem] tracking-[0.35em] uppercase text-text-muted">Contact</span>
          </div>
          <button
            onClick={() => { window.location.href = `mailto:${["1193662756", "qq.com"].join("@")}`; }}
            className="font-display text-2xl md:text-3xl text-text-muted hover:text-accent transition-colors duration-500"
          >
            邮箱联系
          </button>

          <div className="flex items-center justify-center gap-8 mt-10">
            {/* GitHub */}
            <a href="https://github.com/tangdogdaihuman" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-2 text-text-muted hover:text-accent transition-colors duration-500">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span className="text-[0.55rem] tracking-[0.25em] uppercase">GitHub</span>
            </a>

            {/* ArtStation */}
            <a href="https://www.artstation.com/uuey7" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-2 text-text-muted hover:text-accent transition-colors duration-500">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M0 16.571h5.143l2.25 3.927L12 12.643 6.857 3.857 0 16.571zm24 0h-5.143l-2.25 3.927L12 12.643 17.143 3.857 24 16.571zM16.571 16.571h3.429l-1.714-3.156-1.715 3.156z"/></svg>
              <span className="text-[0.55rem] tracking-[0.25em] uppercase">ArtStation</span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center">
        <div className="divider-line mx-auto mb-6" />
        <p className="text-[0.6rem] tracking-[0.3em] uppercase text-text-muted/30">&copy; {new Date().getFullYear()} · All Rights Reserved</p>
      </footer>
    </>
  );
}
