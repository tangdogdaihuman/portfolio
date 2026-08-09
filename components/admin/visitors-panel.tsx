"use client";

import { useCallback, useEffect, useState } from "react";
import type { VisitStats } from "@/lib/types";

function formatTime(utc: string): string {
  const date = new Date(`${utc.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return utc;
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function summarizeUA(ua: string): string {
  if (!ua) return "未知设备";
  let browser = "其他";
  if (/micromessenger/i.test(ua)) browser = "微信";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";
  let os = "其他";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";
  return `${os} · ${browser}`;
}

function referrerHost(referrer: string): string {
  if (!referrer) return "直接访问";
  try {
    const host = new URL(referrer).host;
    if (typeof window !== "undefined" && host === window.location.host) return "站内跳转";
    return host;
  } catch {
    return referrer;
  }
}

export default function VisitorsPanel() {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/visits");
      if (!res.ok) throw new Error(String(res.status));
      setStats(await res.json() as VisitStats);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (loading && !stats) {
    return <p className="text-sm text-text-muted">正在加载访客数据…</p>;
  }

  if (error || !stats) {
    return (
      <div className="glass-strong rounded-[28px] p-6 md:p-7">
        <p className="text-sm text-text-muted">访客数据加载失败</p>
        <button
          onClick={load}
          data-hover
          className="glass-chip mt-4 rounded-full px-4 py-2 text-[0.72rem] tracking-[0.08em] text-text"
        >
          重试
        </button>
      </div>
    );
  }

  const cards = [
    { label: "总访问量", value: stats.totalVisits },
    { label: "独立访客", value: stats.uniqueVisitors },
    { label: "今日访问", value: stats.todayVisits, sub: `${stats.todayVisitors} 位访客` },
    { label: "近 7 日访问", value: stats.weekVisits },
  ];
  const maxDaily = Math.max(...stats.daily.map((d) => d.visits), 1);
  const maxTop = Math.max(...stats.topPages.map((p) => p.visits), 1);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="glass-strong rounded-[24px] p-5">
            <p className="meta-label">{card.label}</p>
            <p className="mt-2.5 font-display text-2xl text-text">{card.value}</p>
            {card.sub && <p className="mt-1 text-xs text-text-muted">{card.sub}</p>}
          </div>
        ))}
      </div>

      <div className="glass-strong mb-6 rounded-[28px] p-6 md:p-7">
        <div className="mb-5 flex items-center justify-between">
          <p className="meta-label">近 14 日访问趋势</p>
          <button
            onClick={load}
            data-hover
            className="glass-chip rounded-full px-3.5 py-1.5 text-[0.68rem] tracking-[0.08em] text-text-muted transition-colors duration-300 hover:text-text"
          >
            刷新
          </button>
        </div>
        {stats.daily.length === 0 ? (
          <p className="text-sm text-text-muted">暂无数据，有访客访问后显示</p>
        ) : (
          <div className="flex h-32 items-end gap-1.5">
            {stats.daily.map((day) => (
              <div key={day.date} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[0.6rem] text-text-muted opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {day.visits}
                </span>
                <div
                  className="w-full rounded-full bg-accent/50 transition-colors duration-300 group-hover:bg-accent"
                  style={{ height: `${Math.max((day.visits / maxDaily) * 100, 4)}%` }}
                  title={`${day.date}：${day.visits} 次访问 / ${day.visitors} 位访客`}
                />
                <span className="text-[0.58rem] text-text-muted">{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {stats.topPages.length > 0 && (
        <div className="glass-strong mb-6 rounded-[28px] p-6 md:p-7">
          <p className="meta-label mb-5">热门页面</p>
          <div className="space-y-3.5">
            {stats.topPages.map((page, index) => (
              <div key={page.path}>
                <div className="mb-1.5 flex items-center justify-between gap-4">
                  <span className="truncate text-sm text-text">
                    <span className="mr-2 text-xs text-text-muted">{index + 1}.</span>
                    {page.title}
                  </span>
                  <span className="whitespace-nowrap text-xs text-accent">{page.visits} 次</span>
                </div>
                <div className="glass-chip h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-accent/50"
                    style={{ width: `${Math.max((page.visits / maxTop) * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-strong rounded-[28px] p-6 md:p-7">
        <div className="mb-2 flex items-center justify-between">
          <p className="meta-label">最近访问</p>
          <p className="text-[0.62rem] text-text-muted/70">已自动过滤你自己的访问</p>
        </div>
        <p className="mb-5 text-[0.68rem] leading-relaxed text-text-muted/80">
          来源口径：直接访问 = 访客手动输入网址或通过书签打开；站内跳转 = 从本站其他页面点击进入；其余显示外部来源域名。
        </p>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-text-muted">暂无访问记录</p>
        ) : (
          <div className="space-y-2.5">
            <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 px-4 text-[0.6rem] tracking-[0.12em] text-text-muted/60 sm:flex">
              <span className="w-24 shrink-0">时间</span>
              <span className="min-w-0 flex-1">页面</span>
              <span className="w-28">设备</span>
              <span className="w-24">来源</span>
            </div>
            {stats.recent.map((visit) => (
              <div key={visit.id} className="glass flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[20px] px-4 py-3">
                <span className="w-24 shrink-0 text-xs text-text-muted">{formatTime(visit.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={visit.path}>{visit.title}</span>
                <span className="w-28 truncate text-xs text-text-muted">{summarizeUA(visit.userAgent)}</span>
                <span className="w-24 truncate text-xs text-text-muted">{referrerHost(visit.referrer)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
