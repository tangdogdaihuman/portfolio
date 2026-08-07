"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import type { Work } from "@/lib/types";
import ThemeToggle from "@/components/theme-toggle";
import { EASE_OUT, SPRING_SOFT } from "@/components/reveal";
import AddWorkForm from "@/components/admin/add-work-form";
import ConfirmDialog from "@/components/admin/confirm-dialog";
import DetailSectionsEditor from "@/components/admin/detail-sections-editor";
import EditWorkForm from "@/components/admin/edit-work-form";
import IntroForm from "@/components/admin/intro-form";
import StoragePanel from "@/components/admin/storage-panel";
import VisitorsPanel from "@/components/admin/visitors-panel";
import WorkList from "@/components/admin/work-list";
import { createEmptyWorkFormState } from "@/components/admin/work-form-state";

const MAIN_TABS = ["works", "add", "intro", "detail", "visitors", "storage"] as const;

type MainTab = typeof MAIN_TABS[number];
type AdminTab = MainTab | "edit";

function isMainTab(value: string | null): value is MainTab {
  return value !== null && MAIN_TABS.includes(value as MainTab);
}

function getWorkUpdatedAt(work: Work): string {
  return work.updated_at;
}

function getTabLabel(tab: MainTab) {
  if (tab === "works") return "作品列表";
  if (tab === "add") return "新增作品";
  if (tab === "intro") return "个人介绍";
  if (tab === "detail") return "详细介绍";
  if (tab === "visitors") return "访客";
  return "容量";
}

export default function AdminPageClient() {
  const [tab, setTab] = useState<AdminTab>(() => {
    if (typeof window === "undefined") return "works";
    const queryTab = new URLSearchParams(window.location.search).get("tab");
    return isMainTab(queryTab) ? queryTab : "works";
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState(createEmptyWorkFormState);
  const [works, setWorks] = useState<Work[]>([]);
  const [intro, setIntro] = useState("");
  const [tagline, setTagline] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Work | null>(null);
  const [reordering, setReordering] = useState(false);
  const router = useRouter();
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderingRef = useRef(false);

  const showMsg = useCallback((text: string, ok: boolean) => {
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }
    setMessage({ text, ok });
    messageTimerRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [worksResponse, introResponse] = await Promise.all([
        fetch("/api/works"),
        fetch("/api/intro"),
      ]);

      if (worksResponse.ok) {
        setWorks(await worksResponse.json() as Work[]);
      }

      if (introResponse.ok) {
        const data = await introResponse.json() as { content?: string; tagline?: string };
        setIntro(data.content || "");
        setTagline(data.tagline || "");
      }
    } catch {
      showMsg("刷新数据失败，请检查网络后重试", false);
    }
  }, [showMsg]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const setMainTab = (nextTab: MainTab) => {
    setTab(nextTab);
    router.replace(`/admin?tab=${nextTab}`, { scroll: false });
  };

  const saveIntro = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/intro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: intro, tagline }),
      });
      showMsg(response.ok ? "已保存" : "保存失败", response.ok);
    } catch {
      showMsg("保存失败，请检查网络后重试", false);
    } finally {
      setLoading(false);
    }
  };

  const moveWork = async (work: Work, direction: "up" | "down") => {
    if (reorderingRef.current) return;

    const index = works.findIndex((item) => item.id === work.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= works.length) return;

    const other = works[swapIndex];
    if (work.pinned !== other.pinned) {
      showMsg("置顶作品和普通作品分开排序，请先切换置顶状态", false);
      return;
    }

    const nextWorkSortOrder = other.sort_order ?? 0;
    const nextOtherSortOrder = work.sort_order ?? 0;
    const updatedWorks = [...works];
    updatedWorks[index] = { ...other, sort_order: nextOtherSortOrder };
    updatedWorks[swapIndex] = { ...work, sort_order: nextWorkSortOrder };
    setWorks(updatedWorks);

    reorderingRef.current = true;
    setReordering(true);

    try {
      const res = await fetch("/api/works/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: work.id, sortOrder: nextWorkSortOrder, expectedUpdatedAt: getWorkUpdatedAt(work) },
            { id: other.id, sortOrder: nextOtherSortOrder, expectedUpdatedAt: getWorkUpdatedAt(other) },
          ],
        }),
      });

      if (!res.ok) {
        refresh();
        showMsg(res.status === 409 ? "排序冲突，已刷新，请重试" : "排序失败，已刷新，请重试", false);
        return;
      }

      const body = await res.json().catch(() => null) as { updated?: Array<{ id: string; updatedAt: string }> } | null;
      const updates = body?.updated ?? [];
      setWorks((current) =>
        current.map((item) => {
          const next = updates.find((entry) => entry.id === item.id);
          return next ? { ...item, updated_at: next.updatedAt } : item;
        })
      );
    } catch {
      refresh();
      showMsg("排序失败，已刷新，请重试", false);
    } finally {
      reorderingRef.current = false;
      setReordering(false);
    }
  };

  const deleteWork = async (work: Work) => {
    try {
      const response = await fetch(`/api/works/${work.id}`, { method: "DELETE" });
      if (response.ok) {
        refresh();
        showMsg("已删除", true);
      } else {
        showMsg("删除失败", false);
      }
    } catch {
      showMsg("删除失败，请检查网络后重试", false);
    } finally {
      setPendingDelete(null);
    }
  };

  const togglePin = async (work: Work) => {
    const response = await fetch(`/api/works/${work.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !work.pinned, expectedUpdatedAt: getWorkUpdatedAt(work) }),
    });
    if (response.ok) {
      refresh();
      return;
    }
    if (response.status === 409) {
      refresh();
      showMsg("置顶状态冲突，已刷新", false);
      return;
    }
    showMsg("置顶状态更新失败", false);
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="mx-auto max-w-4xl px-5 pb-16 pt-24 md:px-6">
        <header className="animate-fade-up fixed left-1/2 top-4 z-[70] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2">
          <nav className="glass-strong flex items-center justify-between gap-2 rounded-full py-1.5 pl-5 pr-1.5">
            <Link href="/" data-hover className="font-display text-[0.95rem] tracking-wide text-text">
              TZH<span className="text-accent">.</span>
            </Link>
            <span className="meta-label hidden sm:block">Admin Console</span>
            <ThemeToggle />
          </nav>
        </header>

        <AnimatePresence>
          {message && (
            <m.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className={`glass-strong fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border px-5 py-2.5 text-[0.78rem] tracking-wide ${
                message.ok
                  ? "border-accent/40 text-accent-strong"
                  : "border-red-400/40 text-red-300"
              }`}
            >
              {message.text}
            </m.div>
          )}
        </AnimatePresence>

        <div className="animate-fade-up mb-8 overflow-x-auto [animation-delay:0.08s]">
          <div role="tablist" aria-label="后台功能" className="glass-chip flex min-w-max gap-1 rounded-full p-1">
            {MAIN_TABS.map((item) => (
              <button
                key={item}
                id={`admin-tab-${item}`}
                role="tab"
                aria-selected={tab === item}
                aria-controls={`admin-panel-${item}`}
                onClick={() => setMainTab(item)}
                data-hover
                className={`relative min-h-10 rounded-full px-5 text-[0.75rem] tracking-[0.08em] transition-colors duration-300 ${
                  tab === item ? "text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {tab === item && (
                  <m.span
                    layoutId="admin-tab-bubble"
                    transition={SPRING_SOFT}
                    className="absolute inset-0 rounded-full border border-accent/40 bg-accent/12"
                  />
                )}
                <span className="relative">{getTabLabel(item)}</span>
              </button>
            ))}
          </div>
        </div>

        {tab === "intro" && (
          <div id="admin-panel-intro" role="tabpanel" aria-labelledby="admin-tab-intro" className="animate-fade-up">
            <IntroForm intro={intro} setIntro={setIntro} tagline={tagline} setTagline={setTagline} onSave={saveIntro} loading={loading} />
          </div>
        )}
        {tab === "detail" && (
          <div id="admin-panel-detail" role="tabpanel" aria-labelledby="admin-tab-detail" className="animate-fade-up">
            <DetailSectionsEditor showMsg={showMsg} />
          </div>
        )}
        {tab === "add" && (
          <div id="admin-panel-add" role="tabpanel" aria-labelledby="admin-tab-add" className="animate-fade-up">
            <AddWorkForm
              formState={formState}
              setFormState={setFormState}
              onDone={() => {
                refresh();
                setMainTab("works");
              }}
              showMsg={showMsg}
            />
          </div>
        )}
        {tab === "works" && (
          <div id="admin-panel-works" role="tabpanel" aria-labelledby="admin-tab-works" className="animate-fade-up">
            <WorkList
              works={works}
              onDelete={setPendingDelete}
              onTogglePin={togglePin}
              onEdit={(id) => {
                setEditingId(id);
                setTab("edit");
              }}
              onReorder={moveWork}
              reordering={reordering}
            />
          </div>
        )}
        {tab === "edit" && editingId && (
          <div className="animate-fade-up">
            <EditWorkForm
              workId={editingId}
              onDone={() => {
                refresh();
                setEditingId(null);
                setMainTab("works");
              }}
              onCancel={() => {
                setEditingId(null);
                setMainTab("works");
              }}
              showMsg={showMsg}
            />
          </div>
        )}
        {tab === "visitors" && (
          <div id="admin-panel-visitors" role="tabpanel" aria-labelledby="admin-tab-visitors" className="animate-fade-up">
            <VisitorsPanel />
          </div>
        )}
        {tab === "storage" && (
          <div id="admin-panel-storage" role="tabpanel" aria-labelledby="admin-tab-storage" className="animate-fade-up">
            <StoragePanel works={works} />
          </div>
        )}

        <ConfirmDialog
          open={!!pendingDelete}
          title="删除作品"
          body={pendingDelete ? `将删除《${pendingDelete.title}》以及关联的 R2 图片，此操作无法在后台撤销。` : ""}
          confirmText="删除"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => pendingDelete && deleteWork(pendingDelete)}
        />
      </div>
    </LazyMotion>
  );
}
