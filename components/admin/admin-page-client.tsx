"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Work } from "@/lib/types";
import AddWorkForm from "@/components/admin/add-work-form";
import ConfirmDialog from "@/components/admin/confirm-dialog";
import DetailSectionsEditor from "@/components/admin/detail-sections-editor";
import EditWorkForm from "@/components/admin/edit-work-form";
import IntroForm from "@/components/admin/intro-form";
import StoragePanel from "@/components/admin/storage-panel";
import WorkList from "@/components/admin/work-list";
import { createEmptyWorkFormState } from "@/components/admin/work-form-state";

const MAIN_TABS = ["works", "add", "intro", "detail", "storage"] as const;

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
  const router = useRouter();
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const index = works.findIndex((item) => item.id === work.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= works.length) return;

    const other = works[swapIndex];
    if (work.pinned !== other.pinned) {
      showMsg("置顶作品和普通作品分开排序，请先切换置顶状态", false);
      return;
    }

    const nextWorkSortOrder = direction === "up" ? (other.sort_order ?? 0) + 1 : (other.sort_order ?? 0) - 1;
    const nextOtherSortOrder = work.sort_order ?? 0;
    const updatedWorks = [...works];
    updatedWorks[index] = { ...other, sort_order: nextOtherSortOrder };
    updatedWorks[swapIndex] = { ...work, sort_order: nextWorkSortOrder };
    setWorks(updatedWorks);

    const [updatedWorkRes, updatedOtherRes] = await Promise.all([
      fetch(`/api/works/${work.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: nextWorkSortOrder, expectedUpdatedAt: getWorkUpdatedAt(work) }),
      }),
      fetch(`/api/works/${other.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: nextOtherSortOrder, expectedUpdatedAt: getWorkUpdatedAt(other) }),
      }),
    ]);

    if (!updatedWorkRes.ok || !updatedOtherRes.ok) {
      refresh();
      showMsg("排序冲突，已刷新，请重试", false);
    }
  };

  const deleteWork = async (work: Work) => {
    const response = await fetch(`/api/works/${work.id}`, { method: "DELETE" });
    if (response.ok) {
      refresh();
      showMsg("已删除", true);
    } else {
      showMsg("删除失败", false);
    }
    setPendingDelete(null);
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
    <div className="max-w-4xl mx-auto px-6 py-8">
      {message && (
        <div
          className={`mb-6 px-4 py-3 text-sm ${
            message.ok
              ? "bg-accent/20 text-accent border border-accent-dim"
              : "bg-red-500/20 text-red-300 border border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-8 overflow-x-auto border-b border-border">
        <div role="tablist" aria-label="后台功能" className="flex min-w-max gap-1">
          {MAIN_TABS.map((item) => (
            <button
              key={item}
              id={`admin-tab-${item}`}
              role="tab"
              aria-selected={tab === item}
              aria-controls={`admin-panel-${item}`}
              onClick={() => setMainTab(item)}
              className={`px-5 py-2.5 text-sm tracking-wide transition-colors ${
                tab === item
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {getTabLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {tab === "intro" && (
        <div id="admin-panel-intro" role="tabpanel" aria-labelledby="admin-tab-intro">
          <IntroForm intro={intro} setIntro={setIntro} tagline={tagline} setTagline={setTagline} onSave={saveIntro} loading={loading} />
        </div>
      )}
      {tab === "detail" && (
        <div id="admin-panel-detail" role="tabpanel" aria-labelledby="admin-tab-detail">
          <DetailSectionsEditor showMsg={showMsg} />
        </div>
      )}
      {tab === "add" && (
        <div id="admin-panel-add" role="tabpanel" aria-labelledby="admin-tab-add">
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
        <div id="admin-panel-works" role="tabpanel" aria-labelledby="admin-tab-works">
          <WorkList
            works={works}
            onDelete={setPendingDelete}
            onTogglePin={togglePin}
            onEdit={(id) => {
              setEditingId(id);
              setTab("edit");
            }}
            onReorder={moveWork}
          />
        </div>
      )}
      {tab === "edit" && editingId && (
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
      )}
      {tab === "storage" && (
        <div id="admin-panel-storage" role="tabpanel" aria-labelledby="admin-tab-storage">
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
  );
}
