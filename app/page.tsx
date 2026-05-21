"use client";

import { useState, useEffect } from "react";
import WorkGrid from "@/components/work-grid";

export default function HomePage() {
  const [intro, setIntro] = useState("");
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [introRes, worksRes] = await Promise.all([
          fetch("/api/intro"),
          fetch("/api/works"),
        ]);
        if (introRes.ok) {
          const data = await introRes.json();
          setIntro(data.content || "");
        }
        if (worksRes.ok) {
          setWorks(await worksRes.json());
        }
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="min-h-screen">
      <header className="pt-24 md:pt-32 px-6 pb-12">
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="text-text-muted/30 text-lg">加载中...</div>
          ) : intro ? (
            <div className="max-w-none">
              {intro.split("\n").map((p, i) =>
                p.trim() ? (
                  <p
                    key={i}
                    className="text-text-muted leading-relaxed text-lg"
                  >
                    {p}
                  </p>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      </header>

      <section className="px-4 mb-8">
        <div className="text-center">
          <h1 className="font-display text-4xl md:text-5xl text-text tracking-tight">
            Portfolio
          </h1>
          <p className="mt-3 text-text-muted text-base">精选作品展示</p>
        </div>
      </section>

      <main className="px-4 pb-24 max-w-6xl mx-auto">
        {loading ? null : <WorkGrid works={works} />}
      </main>

      <footer className="py-12 text-center text-text-muted/50 text-sm">
        <p>&copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
