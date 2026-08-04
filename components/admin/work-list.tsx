"use client";

import Image from "next/image";
import type { Work } from "@/lib/types";

export default function WorkList({
  works,
  onDelete,
  onTogglePin,
  onEdit,
  onReorder,
  reordering = false,
}: {
  works: Work[];
  onDelete: (work: Work) => void;
  onTogglePin: (work: Work) => void;
  onEdit: (id: string) => void;
  onReorder: (work: Work, direction: "up" | "down") => void;
  reordering?: boolean;
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
        const canMoveUp = i > 0 && works[i - 1].pinned === work.pinned;
        const canMoveDown = i < works.length - 1 && works[i + 1].pinned === work.pinned;

        return (
          <div
            key={work.id}
            className="glass rounded-[24px] p-4 md:p-5"
          >
            <div className="flex items-start gap-4">
              <Image
                src={work.thumb_url}
                alt={work.title}
                width={80}
                height={64}
                unoptimized
                className="w-20 h-16 object-cover flex-shrink-0 rounded-xl"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-text truncate">{work.title}</h3>
                  {work.pinned && (
                    <span className="text-[10px] uppercase tracking-wider bg-accent text-on-accent px-2 py-0.5 rounded-full">
                      Top
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {work.work_date && (
                    <span className="text-xs text-accent">{work.work_date}</span>
                  )}
                  <p className="text-text-muted text-sm truncate">{work.description}</p>
                </div>
                {work.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {work.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-text-muted border border-border/60 px-2.5 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="glass-chip h-1.5 flex-1 overflow-hidden rounded-full">
                    <div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.max(wpct, 1)}%` }} />
                  </div>
                  <span className="text-[10px] text-text-muted">{wgt.toFixed(1)} / {wpct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <div className="glass-chip inline-flex overflow-hidden rounded-full">
                  <button
                    onClick={() => onReorder(work, "up")}
                    disabled={reordering || !canMoveUp}
                    title={i > 0 && !canMoveUp ? "置顶作品和普通作品分开排序" : undefined}
                    className="min-h-10 min-w-10 text-xs text-text-muted hover:text-accent disabled:opacity-30"
                    aria-label="上移排序"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onReorder(work, "down")}
                    disabled={reordering || !canMoveDown}
                    title={i < works.length - 1 && !canMoveDown ? "置顶作品和普通作品分开排序" : undefined}
                    className="min-h-10 min-w-10 border-l border-border/60 text-xs text-text-muted hover:text-accent disabled:opacity-30"
                    aria-label="下移排序"
                  >
                    ↓
                  </button>
                </div>
                <button onClick={() => onTogglePin(work)} className="glass-chip min-h-10 rounded-full px-3.5 text-xs text-text-muted hover:text-text transition-colors">{work.pinned ? "取消置顶" : "置顶"}</button>
                <button onClick={() => onEdit(work.id)} className="glass-chip min-h-10 rounded-full px-3.5 text-xs text-text-muted hover:text-text transition-colors">编辑</button>
                <button onClick={() => onDelete(work)} className="min-h-10 rounded-full border border-red-400/30 px-3.5 text-xs text-red-300/80 hover:border-red-400/50 hover:text-red-300 transition-colors">删除</button>
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
