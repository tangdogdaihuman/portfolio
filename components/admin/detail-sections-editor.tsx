"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/admin/confirm-dialog";

interface Section {
  id: string;
  title: string;
  content: string;
  sort_order: number;
}

function toggleSelectionBold(el: HTMLDivElement) {
  el.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !el.contains(range.commonAncestorContainer)) return;

  const fragment = range.extractContents();
  const strong = document.createElement("strong");
  strong.appendChild(fragment);
  range.insertNode(strong);

  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(strong);
  nextRange.collapse(false);
  selection.addRange(nextRange);
}

export default function DetailSectionsEditor({ showMsg }: { showMsg: (text: string, ok: boolean) => void }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Section | null>(null);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/detail-sections");
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        if (!cancelled) setSections(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) showMsg("加载详细介绍失败，请刷新重试", false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [showMsg]);

  useEffect(() => {
    for (const s of sections) {
      const el = contentRefs.current[s.id];
      if (el && el.innerHTML !== s.content) {
        el.innerHTML = s.content;
      }
    }
  }, [sections]);

  const addSection = async () => {
    const res = await fetch("/api/detail-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新栏目", content: "" }),
    });
    if (res.ok) {
      const { id } = await res.json();
      setSections((prev) => [...prev, { id, title: "新栏目", content: "", sort_order: prev.length }]);
    }
  };

  const updateSection = (id: string, field: "title" | "content", value: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const saveAll = async () => {
    setSaving(true);
    const results = await Promise.allSettled(
      sections.map(async (s) => {
        const res = await fetch(`/api/detail-sections/${s.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: s.title, content: s.content, sortOrder: s.sort_order }),
        });
        if (!res.ok) throw new Error(`${s.title} 保存失败`);
        return s.id;
      })
    );
    const failed = sections.filter((_, index) => results[index].status === "rejected");
    setFailedIds(failed.map((s) => s.id));
    if (failed.length === 0) {
      showMsg("已保存", true);
    } else {
      showMsg(`保存失败 ${failed.length} 条：${failed.map((s) => s.title).join("、")}，可再次点击保存全部重试`, false);
    }
    setSaving(false);
  };

  const deleteSection = async (section: Section) => {
    const res = await fetch(`/api/detail-sections/${section.id}`, { method: "DELETE" });
    if (res.ok) {
      setSections((prev) => prev.filter((s) => s.id !== section.id));
      showMsg("已删除", true);
    } else {
      showMsg("删除失败", false);
    }
    setPendingDelete(null);
  };

  const reloadSections = useCallback(async () => {
    try {
      const res = await fetch("/api/detail-sections");
      if (res.ok) {
        const data = await res.json();
        setSections(Array.isArray(data) ? data : []);
      }
    } catch {
      showMsg("刷新详细介绍失败", false);
    }
  }, [showMsg]);

  const moveSection = async (id: string, direction: "up" | "down") => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    const updated = [...sections];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const reordered = updated.map((section, index) => ({ ...section, sort_order: index }));
    setSections(reordered);

    const res = await fetch("/api/detail-sections/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { id: reordered[idx].id, sortOrder: idx },
          { id: reordered[swapIdx].id, sortOrder: swapIdx },
        ],
      }),
    });
    if (!res.ok) {
      showMsg("排序失败，已刷新，请重试", false);
      void reloadSections();
    }
  };

  if (loading) return <div className="text-text-muted text-sm">加载中...</div>;

  return (
    <div className="glass space-y-4 rounded-[28px] p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-text-muted">共 {sections.length} 个子栏目，前台默认折叠，点击展开</p>
        <div className="flex gap-2">
          <button onClick={addSection} className="glass-chip rounded-full px-4 py-2 text-xs text-accent transition-colors hover:text-accent-strong">+ 添加子栏目</button>
          <button onClick={saveAll} disabled={saving} className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-on-accent transition-colors hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-50">{saving ? "保存中..." : "保存全部"}</button>
        </div>
      </div>
      {sections.map((s, i) => (
        <div key={s.id} className={`glass space-y-3 rounded-[24px] p-4 md:p-5 ${failedIds.includes(s.id) ? "outline-2 outline-solid outline-red-400/60" : ""}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => moveSection(s.id, "up")} disabled={i === 0} className="glass-chip h-8 w-8 shrink-0 rounded-full text-xs text-text-muted transition-colors hover:text-text disabled:opacity-30">↑</button>
            <button onClick={() => moveSection(s.id, "down")} disabled={i === sections.length - 1} className="glass-chip h-8 w-8 shrink-0 rounded-full text-xs text-text-muted transition-colors hover:text-text disabled:opacity-30">↓</button>
            <input
              value={s.title}
              onChange={(e) => updateSection(s.id, "title", e.target.value)}
              aria-label="栏目标题"
              className="glass-chip min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none"
              placeholder="栏目标题"
            />
            <button onClick={() => setPendingDelete(s)} className="shrink-0 rounded-full border border-red-400/30 px-3 py-1.5 text-xs text-red-300/80 transition-colors hover:border-red-400/50 hover:text-red-300">删除</button>
          </div>
          {failedIds.includes(s.id) && (
            <p className="text-xs text-red-400" role="alert">本条保存失败，点击右上角「保存全部」重试</p>
          )}
          <div className="flex items-start gap-2">
            <div
              ref={(el) => { if (el) contentRefs.current[s.id] = el; }}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={`${s.title || "栏目"} 内容`}
              onInput={(e) => updateSection(s.id, "content", e.currentTarget.innerHTML)}
              className="glass-chip w-full min-h-[6rem] rounded-2xl px-4 py-3 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none whitespace-pre-wrap"
            />
            <button
              type="button"
              title="加粗"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = contentRefs.current[s.id];
                if (!el) return;
                toggleSelectionBold(el);
                updateSection(s.id, "content", el.innerHTML);
              }}
              className="glass-chip h-8 w-8 shrink-0 rounded-full text-xs font-bold text-text-muted transition-colors hover:text-accent"
            >
              B
            </button>
          </div>
        </div>
      ))}
      {sections.length === 0 && (
        <p className="text-text-muted text-sm text-center py-8">暂无子栏目，点击上方按钮添加</p>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除栏目"
        body={pendingDelete ? `将删除"${pendingDelete.title}"这一段详细介绍。` : ""}
        confirmText="删除"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteSection(pendingDelete)}
      />
    </div>
  );
}
