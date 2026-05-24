"use client";

import Image from "next/image";
import type { Work } from "@/lib/types";

export default function WorkList({
  works,
  onDelete,
  onTogglePin,
  onEdit,
  onReorder,
}: {
  works: Work[];
  onDelete: (work: Work) => void;
  onTogglePin: (work: Work) => void;
  onEdit: (id: string) => void;
  onReorder: (work: Work, direction: "up" | "down") => void;
}) {
  const totalWeight = works.reduce((sum, work) => sum + (work.size_weight ?? 1), 0);

  return (
    <div className="space-y-3">
      {works.length === 0 && (
        <p className="text-text-muted text-sm">暂无作品</p>
      )}
      {works.map((work, i) => {
        const wgt = work.size_weight ?? 1;
        const wpct = totalWeight > 0 ? (wgt / totalWeight) * 100 : 0;
        return (
          <div
            key={work.id}
            className="bg-bg border border-border p-4"
          >
            <div className="flex items-start gap-4">
              <Image
                src={work.thumb_url}
                alt={work.title}
                width={80}
                height={64}
                unoptimized
                className="w-20 h-16 object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-text truncate">{work.title}</h3>
                  {work.pinned && (
                    <span className="text-[10px] uppercase tracking-wider bg-accent text-bg px-1.5 py-0.5">
                      Top
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {work.work_date && (
                    <span className="text-xs text-accent-dim">{work.work_date}</span>
                  )}
                  <p className="text-text-muted text-sm truncate">{work.description}</p>
                </div>
                {work.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {work.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-accent-dim border border-accent-dim/20 px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 bg-surface overflow-hidden">
                    <div className="h-full bg-accent/50" style={{ width: `${Math.max(wpct, 1)}%` }} />
                  </div>
                  <span className="text-[10px] text-accent-dim">{wgt.toFixed(1)} / {wpct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <div className="inline-flex border border-border/80">
                  <button
                    onClick={() => onReorder(work, "up")}
                    disabled={i === 0}
                    className="min-h-10 min-w-10 text-xs text-text-muted hover:text-accent disabled:opacity-30"
                    aria-label="上移排序"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onReorder(work, "down")}
                    disabled={i === works.length - 1}
                    className="min-h-10 min-w-10 border-l border-border/80 text-xs text-text-muted hover:text-accent disabled:opacity-30"
                    aria-label="下移排序"
                  >
                    ↓
                  </button>
                </div>
                <button onClick={() => onTogglePin(work)} className="min-h-10 px-3 border border-border/80 text-xs text-text-muted hover:text-accent transition-colors">{work.pinned ? "取消置顶" : "置顶"}</button>
                <button onClick={() => onEdit(work.id)} className="min-h-10 px-3 border border-border/80 text-xs text-text-muted hover:text-accent transition-colors">编辑</button>
                <button onClick={() => onDelete(work)} className="min-h-10 px-3 border border-red-400/30 text-xs text-red-400/70 hover:text-red-400 transition-colors">删除</button>
              </div>
            </div>
            <div className="mt-4 text-xs text-text-muted">
              展示权重分布
            </div>
          </div>
        );
      })}
    </div>
  );
}

