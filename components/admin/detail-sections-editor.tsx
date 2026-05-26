"use client";

import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/admin/confirm-dialog";

interface Section {
  id: string;
  title: string;
  content: string;
  sort_order: number;
}

export default function DetailSectionsEditor({ showMsg }: { showMsg: (text: string, ok: boolean) => void }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Section | null>(null);
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/detail-sections")
      .then((r) => r.json())
      .then((data) => setSections(data))
      .finally(() => setLoading(false));
  }, []);

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
    const results = await Promise.all(
      sections.map((s) =>
        fetch(`/api/detail-sections/${s.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: s.title, content: s.content, sortOrder: s.sort_order }),
        })
      )
    );
    const ok = results.every((r) => r.ok);
    showMsg(ok ? "已保存" : "部分保存失败", ok);
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

  const moveSection = async (id: string, direction: "up" | "down") => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    const updated = [...sections];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const reordered = updated.map((section, index) => ({ ...section, sort_order: index }));
    setSections(reordered);

    await Promise.all([
      fetch(`/api/detail-sections/${reordered[idx].id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: idx }),
      }),
      fetch(`/api/detail-sections/${reordered[swapIdx].id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: swapIdx }),
      }),
    ]);
  };

  if (loading) return <div className="text-text-muted text-sm">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">共 {sections.length} 个子栏目，前台默认折叠，点击展开</p>
        <div className="flex gap-2">
          <button onClick={addSection} className="px-4 py-1.5 border border-accent-dim text-accent text-xs hover:bg-accent/10 transition-colors">+ 添加子栏目</button>
          <button onClick={saveAll} disabled={saving} className="px-5 py-1.5 bg-accent text-bg text-xs font-medium hover:bg-accent-dim disabled:opacity-50">{saving ? "保存中..." : "保存全部"}</button>
        </div>
      </div>
      {sections.map((s, i) => (
        <div key={s.id} className="border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => moveSection(s.id, "up")} disabled={i === 0} className="text-xs text-text-muted hover:text-text disabled:opacity-30">↑</button>
            <button onClick={() => moveSection(s.id, "down")} disabled={i === sections.length - 1} className="text-xs text-text-muted hover:text-text disabled:opacity-30">↓</button>
            <input
              value={s.title}
              onChange={(e) => updateSection(s.id, "title", e.target.value)}
              className="flex-1 bg-bg border border-border text-text px-3 py-1.5 text-sm focus:outline-none focus:border-accent-dim"
              placeholder="栏目标题"
            />
            <button onClick={() => setPendingDelete(s)} className="px-2 py-1.5 text-xs text-red-400/70 hover:text-red-400">删除</button>
          </div>
          <div className="flex items-start gap-2">
            <div
              ref={(el) => { if (el) contentRefs.current[s.id] = el; }}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => updateSection(s.id, "content", e.currentTarget.innerHTML)}
              className="w-full min-h-[6rem] bg-bg border border-border text-text px-3 py-2 text-sm focus:outline-none focus:border-accent-dim whitespace-pre-wrap"
            />
            <button
              type="button"
              title="加粗"
              onMouseDown={(e) => {
                e.preventDefault();
                const el = contentRefs.current[s.id];
                if (!el) return;
                el.focus();
                document.execCommand("bold", false);
                updateSection(s.id, "content", el.innerHTML);
              }}
              className="shrink-0 w-8 h-8 border border-border text-text-muted text-xs font-bold hover:text-accent hover:border-accent-dim transition-colors"
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
