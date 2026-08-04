"use client";

import type { Work } from "@/lib/types";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

export default function StoragePanel({ works }: { works: Work[] }) {
  const getSize = (work: Work) => work.total_size || work.image_size || 0;
  const totalBytes = works.reduce((sum, w) => sum + getSize(w), 0);
  const maxGB = 10;
  const usedGB = totalBytes / (1024 * 1024 * 1024);
  const pct = Math.min((usedGB / maxGB) * 100, 100);

  return (
    <div>
      <div className="glass-strong rounded-[28px] p-6 md:p-7 mb-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-2xl font-display text-text">{formatSize(totalBytes)}</p>
            <p className="text-xs text-text-muted mt-1">已用 / {maxGB} GB 总额</p>
          </div>
          <p className="text-sm text-accent">{usedGB.toFixed(2)} GB</p>
        </div>
        <div className="glass-chip h-2 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: pct > 80
                ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                : "linear-gradient(90deg, var(--color-accent), var(--color-accent-strong))",
            }}
          />
        </div>
        <p className="text-xs text-text-muted mt-2">{pct.toFixed(1)}% 已使用</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-text-muted mb-4">各作品占用</p>
        {works
          .filter((w) => getSize(w) > 0)
          .sort((a, b) => getSize(b) - getSize(a))
          .map((work) => {
            const size = getSize(work);
            const wpct = totalBytes > 0 ? (size / totalBytes) * 100 : 0;
            return (
              <div key={work.id} className="glass rounded-[24px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text truncate mr-4">{work.title}</span>
                  <span className="text-xs text-accent whitespace-nowrap">
                    {formatSize(size)} ({wpct.toFixed(1)}%)
                  </span>
                </div>
                <div className="glass-chip h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-accent/50"
                    style={{ width: `${Math.max(wpct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        {works.every((work) => getSize(work) === 0) && (
          <p className="text-text-muted text-sm">暂无数据，上传作品后显示</p>
        )}
      </div>
    </div>
  );
}
