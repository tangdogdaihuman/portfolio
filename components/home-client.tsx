"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useScroll,
  useTransform,
} from "framer-motion";
import type { Work } from "@/lib/types";
import ThemeToggle from "@/components/theme-toggle";
import GlassOrb from "@/components/glass-orb";
import { EASE_OUT, SPRING_SOFT, Reveal } from "@/components/reveal";
import { useActiveHomeSection, useHomeDataRefresh } from "@/components/home-hooks";

const DEFAULT_TAGLINE = "Hard Surface / Stylized Character / Game Art";

type SortMode = "default" | "newest" | "oldest";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "default", label: "精选" },
  { value: "newest", label: "最新" },
  { value: "oldest", label: "最早" },
];

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
      return <strong key={i} className="text-text font-medium">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const SiteNav = memo(function SiteNav({
  worksCount,
  sectionsCount,
}: {
  worksCount: number;
  sectionsCount: number;
}) {
  const [open, setOpen] = useState(false);
  const active = useActiveHomeSection(worksCount, sectionsCount);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const links: Array<{ id: "works" | "about" | "contact"; label: string }> = [
    { id: "works", label: "作品" },
    { id: "about", label: "关于" },
    { id: "contact", label: "联系" },
  ];

  return (
    <m.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, delay: 0.2, ease: EASE_OUT }}
      className="fixed top-4 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2"
    >
      <nav className="glass-strong flex items-center justify-between gap-2 rounded-full py-1.5 pl-5 pr-1.5">
        <a href="#" data-hover className="font-display text-[0.95rem] tracking-wide text-text">
          TZH<span className="text-accent">.</span>
        </a>
        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              data-hover
              className={`meta-label relative rounded-full px-3.5 py-2 transition-colors duration-300 ${
                active === link.id ? "text-text" : "hover:text-text"
              }`}
            >
              {active === link.id && (
                <m.span
                  layoutId="nav-bubble"
                  transition={SPRING_SOFT}
                  className="absolute inset-0 rounded-full border border-accent/40 bg-accent/10"
                />
              )}
              <span className="relative">{link.label}</span>
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "关闭导航菜单" : "打开导航菜单"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="glass-chip inline-flex h-10 w-10 items-center justify-center rounded-full text-text md:hidden"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="8" x2="20" y2="8" />
                  <line x1="4" y1="16" x2="20" y2="16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="glass-strong mt-2 rounded-3xl p-2 md:hidden"
          >
            {links.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={() => setOpen(false)}
                className={`block rounded-2xl px-4 py-3.5 text-sm transition-colors ${
                  active === link.id ? "bg-accent/10 text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {link.label}
              </a>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </m.header>
  );
});

function WorkThumbImage({ work, priority }: { work: Work; priority: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      requestAnimationFrame(() => setReady(true));
    }
  }, [work.thumb_url]);

  return (
    <Image
      ref={imageRef}
      src={work.thumb_url}
      alt={work.title}
      width={1200}
      height={1500}
      unoptimized
      priority={priority}
      sizes="(max-width: 768px) 92vw, (max-width: 1280px) 58vw, 44vw"
      className={`block h-auto w-full object-cover transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth > 0) setReady(true);
      }}
      onError={() => setReady(true)}
    />
  );
}

function WorkCard({ work, index, priority }: { work: Work; index: number; priority: boolean }) {
  return (
    <Link
      href={`/work/${work.id}`}
      data-cursor="查看"
      className="group block outline-none"
      aria-label={work.title}
    >
      <div className="relative overflow-hidden rounded-[24px] border border-border/60 bg-surface/40 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-500 group-hover:border-accent/35 group-hover:shadow-[0_28px_70px_-24px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]">
        <div className="overflow-hidden">
          <div className="transition-transform duration-[1.1s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.045]">
            <WorkThumbImage work={work} priority={priority} />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">
          <div className="glass-strong flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <span className="truncate text-sm font-medium text-white">{work.title}</span>
            <span className="meta-label shrink-0 text-white/70!">
              {(work.image_count || 1) > 1 ? `${work.image_count}P` : "单图"}
            </span>
          </div>
        </div>
        {work.pinned && (
          <span className="glass-chip absolute left-3 top-3 rounded-full px-3 py-1.5 text-[0.58rem] font-medium tracking-[0.2em] text-accent-strong">
            FEATURED
          </span>
        )}
      </div>
      <div className="mt-3.5 flex items-baseline justify-between gap-3 px-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="meta-label shrink-0 text-accent!">{String(index + 1).padStart(2, "0")}</span>
          <span className="truncate text-[0.95rem] text-text transition-colors duration-300 group-hover:text-accent-strong">
            {work.title}
          </span>
        </div>
        <div className="meta-label flex shrink-0 items-baseline gap-3">
          {work.tags.slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {work.work_date && <span>{work.work_date}</span>}
        </div>
      </div>
    </Link>
  );
}

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVisible(window.scrollY > window.innerHeight * 0.9);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const scrollTop = () => {
    if (window.__lenis) {
      window.__lenis.scrollTo(0, { duration: 1.4 });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <m.button
          initial={{ opacity: 0, y: 18, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={SPRING_SOFT}
          type="button"
          onClick={scrollTop}
          aria-label="回到顶部"
          data-hover
          className="glass-strong fixed bottom-6 right-6 z-[60] inline-flex h-11 w-11 items-center justify-center rounded-full text-text transition-transform duration-300 hover:scale-105 active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </m.button>
      )}
    </AnimatePresence>
  );
}

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
  initialSections: { id: string; title: string; content: string }[];
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
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const heroRef = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => [...new Set(works.flatMap((w) => w.tags))], [works]);
  const filtered = useMemo(
    () => (activeTag ? works.filter((w) => w.tags.includes(activeTag)) : works),
    [activeTag, works]
  );
  const sorted = useMemo(() => {
    if (sortMode === "default") return filtered;
    return [...filtered].sort((a, b) => {
      const da = a.work_date || "";
      const db = b.work_date || "";
      return sortMode === "newest" ? db.localeCompare(da) : da.localeCompare(db);
    });
  }, [filtered, sortMode]);

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.55], [1, 0.94]);
  const heroBlur = useTransform(scrollYProgress, [0, 0.55], [0, 10]);
  const heroFilter = useTransform(heroBlur, (v) => `blur(${v}px)`);

  const introLines = useMemo(() => intro.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6), [intro]);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>
        <SiteNav worksCount={works.length} sectionsCount={detailSections.length} />

        <main className="relative">
          <section ref={heroRef} className="relative flex min-h-svh flex-col justify-center overflow-hidden px-5 md:px-12">
            <m.div
              style={{ opacity: heroOpacity, scale: heroScale, filter: heroFilter }}
              className="mx-auto w-full max-w-6xl"
            >
              <div className="meta-label flex items-center justify-between gap-4 border-b border-border/50 pb-4">
                <m.span
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.15, ease: EASE_OUT }}
                >
                  CG Artist Portfolio
                </m.span>
                <m.span
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.25, ease: EASE_OUT }}
                >
                  {String(works.length).padStart(2, "0")} Works — {new Date().getFullYear()}
                </m.span>
              </div>

              <h1 className="mt-10 md:mt-14" aria-label="唐子航 Tang Zihang">
                <span className="block overflow-hidden">
                  <m.span
                    initial={{ y: "108%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 1.1, delay: 0.3, ease: EASE_OUT }}
                    className="font-display-sc block text-[clamp(3.4rem,11vw,8.5rem)] leading-[1.04] text-text"
                  >
                    唐子航
                  </m.span>
                </span>
                <span className="mt-2 block overflow-hidden">
                  <m.span
                    initial={{ y: "108%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 1.1, delay: 0.42, ease: EASE_OUT }}
                    className="font-display block text-[clamp(1.6rem,4.6vw,3.4rem)] italic leading-[1.1] tracking-tight text-text-muted"
                  >
                    Tang Zihang<span className="not-italic text-accent"> — </span>CG Works
                  </m.span>
                </span>
              </h1>

              <m.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.62, ease: EASE_OUT }}
                className="meta-label mt-7 tracking-[0.3em]! text-accent-strong!"
              >
                {tagline}
              </m.p>

              {introLines.length > 0 && (
                <div className="mt-6 max-w-xl space-y-3">
                  {introLines.map((line, i) => (
                    <m.p
                      key={`${i}-${line}`}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.7, delay: 0.72 + i * 0.07, ease: EASE_OUT }}
                      className="text-[0.95rem] leading-[1.85] text-text-muted"
                    >
                      {line}
                    </m.p>
                  ))}
                </div>
              )}

              <m.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.95, ease: EASE_OUT }}
                className="mt-10 flex flex-wrap items-center gap-3"
              >
                <a
                  href="#works"
                  data-hover
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-full bg-accent px-7 text-[0.78rem] font-medium tracking-[0.14em] text-on-accent shadow-[0_14px_36px_-10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] transition-[transform,box-shadow] duration-400 hover:scale-[1.03] hover:shadow-[0_18px_44px_-10px_color-mix(in_srgb,var(--color-accent)_70%,transparent)] active:scale-[0.98]"
                >
                  浏览作品
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </a>
                <a
                  href="#contact"
                  data-hover
                  className="glass inline-flex min-h-12 items-center rounded-full px-7 text-[0.78rem] font-medium tracking-[0.14em] text-text transition-transform duration-400 hover:scale-[1.03] active:scale-[0.98]"
                >
                  联系我
                </a>
              </m.div>

              <m.div
                initial={{ opacity: 0, scale: 0.85, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 1.3, delay: 1.1, ease: EASE_OUT }}
                className="mt-14 md:mt-20"
              >
                <GlassOrb size={200} className="origin-top-left scale-[0.62] md:scale-100" />
              </m.div>
            </m.div>

            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 1.4 }}
              style={{ opacity: heroOpacity }}
              className="absolute bottom-7 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"
            >
              <span className="meta-label">Scroll</span>
              <span className="relative block h-9 w-px overflow-hidden bg-border">
                <span className="scroll-cue-dot absolute left-0 top-0 block h-2 w-px bg-text" />
              </span>
            </m.div>
          </section>

          <section id="works" className="relative mx-auto max-w-7xl scroll-mt-28 px-5 pb-24 pt-20 md:px-8 md:pt-24">
            <Reveal>
              <div className="flex items-end justify-between gap-6">
                <div>
                  <p className="meta-label">01 / Selected Works</p>
                  <h2 className="font-display mt-3 text-[clamp(2rem,5vw,3.4rem)] leading-none text-text">作品集</h2>
                </div>
                <p className="meta-label hidden pb-1 md:block">
                  {String(sorted.length).padStart(2, "0")} / {String(works.length).padStart(2, "0")} 件
                </p>
              </div>
            </Reveal>

            {tags.length > 0 && (
              <Reveal delay={0.08}>
                <div className="glass-strong sticky top-[84px] z-40 mt-9 flex flex-wrap items-center gap-2 rounded-[22px] p-2 md:rounded-full">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTag(null)}
                      data-hover
                      className={`min-h-10 rounded-full px-4 text-[0.72rem] tracking-[0.1em] transition-colors duration-300 ${
                        activeTag === null
                          ? "bg-accent/15 text-accent-strong shadow-[inset_0_0_0_0.5px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      全部
                    </button>
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                        data-hover
                        className={`min-h-10 rounded-full px-4 text-[0.72rem] tracking-[0.1em] transition-colors duration-300 ${
                          activeTag === tag
                            ? "bg-accent/15 text-accent-strong shadow-[inset_0_0_0_0.5px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <span className="flex-1" />
                  <div className="glass-chip relative flex rounded-full p-1">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={sortMode === option.value}
                        onClick={() => setSortMode(option.value)}
                        data-hover
                        className={`relative min-h-9 rounded-full px-4 text-[0.7rem] tracking-[0.1em] transition-colors duration-300 ${
                          sortMode === option.value ? "text-text" : "text-text-muted hover:text-text"
                        }`}
                      >
                        {sortMode === option.value && (
                          <m.span
                            layoutId="sort-bubble"
                            transition={SPRING_SOFT}
                            className="absolute inset-0 rounded-full border border-accent/40 bg-accent/12"
                          />
                        )}
                        <span className="relative">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}

            <div className="mt-10 md:mt-14">
              {loadingWorks ? (
                <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-12">
                  {[8, 4, 7, 5].map((span, i) => (
                    <div key={i} className={`md:col-span-${span}`} style={{ gridColumn: `span ${Math.min(span, 12)} / span ${Math.min(span, 12)}` }}>
                      <div className="skeleton h-72 rounded-[24px] md:h-96" />
                      <div className="skeleton mt-4 h-3 w-1/2 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="glass rounded-[28px] px-8 py-20 text-center">
                  <p className="meta-label tracking-[0.3em]!">
                    {loadError ? "内容暂时加载失败" : "该分类下还没有作品"}
                  </p>
                  {loadError && (
                    <button
                      type="button"
                      onClick={() => refreshData({ force: true })}
                      data-hover
                      className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-6 text-[0.75rem] font-medium tracking-[0.12em] text-white transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
                    >
                      重试加载
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-12 md:gap-y-16">
                  <AnimatePresence mode="popLayout">
                    {sorted.map((work, i) => {
                      const weight = work.size_weight ?? 1;
                      const span = weight >= 1.5 ? 8 : weight >= 1 ? 7 : 4;
                      return (
                        <m.div
                          key={work.id}
                          layout
                          initial={{ opacity: 0, y: 36, scale: 0.98 }}
                          whileInView={{ opacity: 1, y: 0, scale: 1 }}
                          viewport={{ once: true, margin: "-40px" }}
                          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.28, ease: "easeIn" } }}
                          transition={{ duration: 0.7, ease: EASE_OUT }}
                          className="md:col-span-12"
                          style={{ gridColumn: `span 12 / span 12` }}
                          data-span={span}
                          ref={(el) => {
                            if (el) el.style.gridColumn = window.innerWidth >= 768 ? `span ${span} / span ${span}` : "span 12 / span 12";
                          }}
                        >
                          <WorkCard work={work} index={i} priority={i < 3} />
                        </m.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>

          {detailSections.length > 0 && (
            <section id="about" className="relative mx-auto max-w-7xl scroll-mt-28 px-5 pb-24 md:px-8">
              <Reveal>
                <p className="meta-label">02 / About</p>
                <h2 className="font-display mt-3 text-[clamp(2rem,5vw,3.4rem)] leading-none text-text">关于我</h2>
              </Reveal>
              <div className="mt-10 max-w-3xl space-y-3">
                {detailSections.map((section, i) => {
                  const isOpen = expandedSection === section.id;
                  return (
                    <Reveal key={section.id} delay={i * 0.05}>
                      <div
                        className={`glass overflow-hidden rounded-[22px] transition-[border-color] duration-500 ${
                          isOpen ? "border-accent/35!" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedSection(isOpen ? null : section.id)}
                          aria-expanded={isOpen}
                          aria-controls={`about-panel-${section.id}`}
                          data-hover
                          className="flex min-h-[4.25rem] w-full items-center justify-between gap-4 px-5 py-4 text-left md:px-6"
                        >
                          <span className="flex items-baseline gap-4">
                            <span className="meta-label text-accent!">{String(i + 1).padStart(2, "0")}</span>
                            <span
                              className={`font-display text-lg transition-colors duration-300 md:text-xl ${
                                isOpen ? "text-accent-strong" : "text-text"
                              }`}
                            >
                              {section.title}
                            </span>
                          </span>
                          <m.span
                            animate={{ rotate: isOpen ? 45 : 0 }}
                            transition={SPRING_SOFT}
                            className={`glass-chip inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
                              isOpen ? "text-accent-strong" : "text-text-muted"
                            }`}
                          >
                            +
                          </m.span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <m.div
                              id={`about-panel-${section.id}`}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.5, ease: EASE_OUT }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-6 md:px-6">
                                <div className="border-l-2 border-accent/40 pl-5 text-sm leading-[1.95] text-text-muted whitespace-pre-wrap">
                                  {renderBoldContent(section.content)}
                                </div>
                              </div>
                            </m.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          )}

          <section id="contact" className="relative mx-auto max-w-7xl scroll-mt-28 px-5 pb-20 md:px-8">
            <Reveal>
              <p className="meta-label">03 / Contact</p>
              <h2 className="font-display mt-3 text-[clamp(2rem,5vw,3.4rem)] leading-none text-text">联系我</h2>
            </Reveal>
            <div className="mt-10 grid gap-10 md:grid-cols-12">
              <Reveal delay={0.06} className="md:col-span-7">
                <p className="max-w-md text-sm leading-[1.9] text-text-muted">
                  有项目合作、工作机会，或任何关于 3D 艺术的想法，欢迎随时联系。
                </p>
                <a
                  href="mailto:1193662756@qq.com"
                  data-cursor="写信"
                  className="font-display mt-7 inline-block break-all text-[clamp(1.5rem,3.6vw,2.6rem)] leading-tight text-text transition-colors duration-300 hover:text-accent-strong"
                >
                  1193662756@qq.com
                </a>
              </Reveal>
              <Reveal delay={0.12} className="md:col-span-5">
                <div className="glass rounded-[24px] p-6">
                  <p className="meta-label mb-2">其他方式</p>
                  <div className="divide-y divide-border/60">
                    <div className="flex items-baseline justify-between gap-4 py-3.5 text-sm">
                      <span className="meta-label">微信</span>
                      <span className="text-text">T15918177465</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 py-3.5 text-sm">
                      <span className="meta-label">电话</span>
                      <span className="text-text">15918177465</span>
                    </div>
                    <a
                      href="https://github.com/tangdogdaihuman"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-hover
                      className="group flex items-baseline justify-between gap-4 py-3.5 text-sm text-text transition-colors hover:text-accent-strong"
                    >
                      <span className="meta-label">GitHub</span>
                      <span className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
                    </a>
                    <a
                      href="https://www.artstation.com/uuey7"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-hover
                      className="group flex items-baseline justify-between gap-4 py-3.5 text-sm text-text transition-colors hover:text-accent-strong"
                    >
                      <span className="meta-label">ArtStation</span>
                      <span className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
                    </a>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <footer className="border-t border-border/40">
            <div className="meta-label mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-8 md:flex-row md:px-8">
              <p>&copy; {new Date().getFullYear()} 唐子航 · Tang Zihang</p>
              <p className="hidden md:block">Hard Surface · Stylized Character · Game Art</p>
              <p>All Rights Reserved</p>
            </div>
          </footer>
        </main>

        <BackToTop />
      </LazyMotion>
    </MotionConfig>
  );
}
