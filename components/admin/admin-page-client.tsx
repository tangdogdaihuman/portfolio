"use client";

import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import type { Work } from "@/lib/types";
import { cleanupUploadedFiles, uploadImageToR2, type UploadedFile } from "@/lib/upload-client";
import WorkList from "@/components/admin/work-list";
import StoragePanel from "@/components/admin/storage-panel";
import DetailSectionsEditor from "@/components/admin/detail-sections-editor";

function formatUploadResult(successCount: number, total: number, failures: string[], unit: string) {
  if (failures.length === 0) return `${successCount}/${total} ${unit}上传成功`;
  const shown = failures.slice(0, 3).join("；");
  const more = failures.length > 3 ? `；另有 ${failures.length - 3} 个失败` : "";
  return `${successCount}/${total} ${unit}上传成功，${failures.length} 个失败：${shown}${more}`;
}

function getWorkUpdatedAt(work: Work): string {
  const value = (work as unknown as Record<string, unknown>).updated_at;
  return typeof value === "string" ? value : "";
}

export default function AdminPageClient() {
  const [tab, setTab] = useState<"works" | "intro" | "add" | "storage" | "edit" | "detail">("works");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    title: "",
    description: "",
    tags: "",
    workDate: "",
    uploadedFiles: [],
    coverIndex: 0,
    sizeWeight: 1,
    uploading: false,
    uploadProgress: "",
    uploadTotal: 0,
    uploadDone: 0,
  });
  const [works, setWorks] = useState<Work[]>([]);
  const [intro, setIntro] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Work | null>(null);

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  const refresh = useCallback(() => {
    fetch("/api/works")
      .then((r) => { if (r.ok) r.json().then(setWorks); });
    fetch("/api/intro")
      .then((r) => { if (r.ok) r.json().then((d) => setIntro(d.content)); });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveIntro = async () => {
    setLoading(true);
    const res = await fetch("/api/intro", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: intro }),
    });
    showMsg(res.ok ? "已保存" : "保存失败", res.ok);
    setLoading(false);
  };

  const moveWork = async (work: Work, direction: "up" | "down") => {
    const idx = works.findIndex((w) => w.id === work.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= works.length) return;
    const other = works[swapIdx];

    const a = work.sort_order ?? 0;
    const b = other.sort_order ?? 0;
    const newA = direction === "up" ? b + 1 : b - 1;
    const newB = a;

    const updated = [...works];
    updated[idx] = { ...other, sort_order: newB };
    updated[swapIdx] = { ...work, sort_order: newA };
    setWorks(updated);

    const [resA, resB] = await Promise.all([
      fetch(`/api/works/${work.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: newA, expectedUpdatedAt: getWorkUpdatedAt(work) }),
      }),
      fetch(`/api/works/${other.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: newB, expectedUpdatedAt: getWorkUpdatedAt(other) }),
      }),
    ]);
    if (!resA.ok || !resB.ok) {
      refresh();
      showMsg("排序冲突，已刷新，请重试", false);
    }
  };

  const deleteWork = async (work: Work) => {
    const res = await fetch(`/api/works/${work.id}`, { method: "DELETE" });
    if (res.ok) {
      refresh();
      showMsg("已删除", true);
    } else {
      showMsg("删除失败", false);
    }
    setPendingDelete(null);
  };

  const togglePin = async (work: Work) => {
    const res = await fetch(`/api/works/${work.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !work.pinned, expectedUpdatedAt: getWorkUpdatedAt(work) }),
    });
    if (res.ok) refresh();
    else if (res.status === 409) {
      refresh();
      showMsg("置顶状态冲突，已刷新", false);
    }
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
        <div className="flex min-w-max gap-1">
        {(["works", "add", "intro", "detail", "storage"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm tracking-wide transition-colors ${
              tab === t
                ? "text-accent border-b-2 border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            {t === "works" ? "作品列表" : t === "add" ? "新增作品" : t === "intro" ? "个人介绍" : t === "detail" ? "详细介绍" : "容量"}
          </button>
        ))}
        </div>
      </div>

      {tab === "intro" && <IntroForm intro={intro} setIntro={setIntro} onSave={saveIntro} loading={loading} />}
      {tab === "detail" && <DetailSectionsEditor showMsg={showMsg} />}
      {tab === "add" && <AddWorkForm formState={formState} setFormState={setFormState} onDone={() => { refresh(); setTab("works"); }} showMsg={showMsg} />}
      {tab === "works" && (
        <WorkList
          works={works}
          onDelete={setPendingDelete}
          onTogglePin={togglePin}
          onEdit={(id) => { setEditingId(id); setTab("edit"); }}
          onReorder={moveWork}
        />
      )}
      {tab === "edit" && editingId && (
        <EditWorkForm
          workId={editingId}
          onDone={() => { refresh(); setEditingId(null); setTab("works"); }}
          onCancel={() => { setEditingId(null); setTab("works"); }}
          showMsg={showMsg}
        />
      )}
      {tab === "storage" && <StoragePanel works={works} />}
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

function ConfirmDialog({
  open,
  title,
  body,
  confirmText,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-border bg-surface p-5 shadow-2xl">
        <h2 className="font-display text-xl text-text">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="border border-border px-4 py-2 text-sm text-text-muted hover:text-text">
            取消
          </button>
          <button onClick={onConfirm} className="bg-red-400 px-4 py-2 text-sm font-medium text-bg hover:bg-red-300">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function IntroForm({
  intro,
  setIntro,
  onSave,
  loading,
  label,
}: {
  intro: string;
  setIntro: (v: string) => void;
  onSave: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-text-muted mb-2">
        {label || "个人介绍（支持换行，前台按段落显示）"}
      </label>
      <textarea
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
        rows={10}
        className="w-full bg-bg border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim transition-colors resize-y"
      />
      <button
        onClick={onSave}
        disabled={loading}
        className="mt-4 px-6 py-2 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </div>
  );
}

interface FormState {
  title: string;
  description: string;
  tags: string;
  workDate: string;
  sizeWeight: number;
  uploadedFiles: UploadedFile[];
  coverIndex: number;
  uploading: boolean;
  uploadProgress: string;
  uploadTotal: number;
  uploadDone: number;
}

function AddWorkForm({
  formState,
  setFormState,
  onDone,
  showMsg,
}: {
  formState: FormState;
  setFormState: (s: FormState) => void;
  onDone: () => void;
  showMsg: (text: string, ok: boolean) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { title, description, tags, workDate, sizeWeight, uploadedFiles, coverIndex, uploading, uploadProgress, uploadTotal, uploadDone } = formState;
  const setTitle = (v: string) => setFormState({ ...formState, title: v });
  const setDescription = (v: string) => setFormState({ ...formState, description: v });
  const setTags = (v: string) => setFormState({ ...formState, tags: v });
  const setWorkDate = (v: string) => setFormState({ ...formState, workDate: v });
  const setUploadedFiles = (v: UploadedFile[]) => setFormState({ ...formState, uploadedFiles: v });
  const setCoverIndex = (v: number) => setFormState({ ...formState, coverIndex: v });
  const setUp = (p: Partial<FormState>) => setFormState({ ...formState, ...p });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const total = files.length;
    setUp({ uploading: true, uploadProgress: "上传中", uploadTotal: total, uploadDone: 0 });

    const fileArray = Array.from(files);
    let completed = 0;
    const results = new Array<UploadedFile | null>(total).fill(null);
    const failures: string[] = [];

    await Promise.all(
      fileArray.map(async (file, idx) => {
        try {
          const result = await uploadImageToR2(file);
          results[idx] = result;
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "上传失败"}`);
        }
        completed++;
        setUp({ uploading: true, uploadProgress: "上传中", uploadTotal: total, uploadDone: completed });
      })
    );

    const ordered = results.filter((r): r is UploadedFile => r !== null);
    setFormState({
      ...formState,
      uploadedFiles: [...formState.uploadedFiles, ...ordered],
      uploading: false,
      uploadProgress: "",
      uploadTotal: 0,
      uploadDone: 0,
    });
    showMsg(
      formatUploadResult(ordered.length, total, failures, "个文件"),
      ordered.length > 0
    );
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const createWork = async () => {
    if (!title || uploadedFiles.length === 0) {
      showMsg("请填写标题并上传至少一张图片", false);
      return;
    }
    setSubmitting(true);
    const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const cover = uploadedFiles[coverIndex] || uploadedFiles[0];

    // Create work with cover image
    const res = await fetch("/api/works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        tags: tagArray,
        imageUrl: cover.imageUrl,
        thumbUrl: cover.thumbUrl,
        pinned: false,
        sortOrder: 0,
        workDate,
        imageSize: cover.size,
        sizeWeight,
      }),
    });
    if (!res.ok) {
      await cleanupUploadedFiles(uploadedFiles);
      showMsg("创建失败", false);
      setSubmitting(false);
      return;
    }

    const { id: workId } = await res.json();

    // Add all images in current order
    if (uploadedFiles.length > 0) {
      const imagesRes = await fetch(`/api/works/${workId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          uploadedFiles.map((f, i) => ({
            imageUrl: f.imageUrl,
            thumbUrl: f.thumbUrl,
            imageSize: f.size,
            sortOrder: i,
          }))
        ),
      });
      if (!imagesRes.ok) {
        showMsg("作品已创建，但图片列表保存失败，请进入编辑页检查", false);
        onDone();
        setSubmitting(false);
        return;
      }
    }

    showMsg("作品已发布", true);
    setFormState({
      title: "", description: "", tags: "", workDate: "",
      uploadedFiles: [], coverIndex: 0, sizeWeight: 1,
      uploading: false, uploadProgress: "", uploadTotal: 0, uploadDone: 0,
    });
    onDone();
    setSubmitting(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-text-muted mb-1">
          图片（可多选，支持超大文件）
        </label>
        {uploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{uploadProgress}</span>
              <span>{uploadDone} / {uploadTotal}</span>
            </div>
            <div className="h-2 bg-surface overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${uploadTotal > 0 ? (uploadDone / uploadTotal) * 100 : 0}%` }}
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">
          展示权重 {sizeWeight.toFixed(1)}（0.5=紧凑 1.0=默认 2.0=大）
        </label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={sizeWeight}
          onChange={(e) => setFormState({ ...formState, sizeWeight: parseFloat(e.target.value) })}
          className="w-full accent-accent"
        />
      </div>
          </div>
        ) : (
          <label className="inline-block px-6 py-10 border-2 border-dashed border-border text-text-muted text-sm cursor-pointer hover:border-accent-dim transition-colors">
            点击选择图片（可多选）
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        )}
        {uploadedFiles.length > 0 && !uploading && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-text-muted mb-2">拖拽排序 · 点击设封面</p>
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((f, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx === null || dragIdx === i) return;
                    const updated = [...uploadedFiles];
                    const [moved] = updated.splice(dragIdx, 1);
                    updated.splice(i, 0, moved);
                    // Adjust cover index
                    if (dragIdx === coverIndex) setCoverIndex(i);
                    else if (dragIdx < coverIndex && i >= coverIndex) setCoverIndex(coverIndex - 1);
                    else if (dragIdx > coverIndex && i <= coverIndex) setCoverIndex(coverIndex + 1);
                    setUploadedFiles(updated);
                    setDragIdx(null);
                  }}
                  onClick={() => setCoverIndex(i)}
                  className={`relative inline-block cursor-grab active:cursor-grabbing group ${
                    i === coverIndex ? "ring-2 ring-accent" : ""
                  }`}
                >
                  <Image
                    src={f.thumbUrl}
                    alt=""
                    width={80}
                    height={64}
                    unoptimized
                    className="w-20 h-16 object-cover border border-border"
                  />
                  {i === coverIndex && (
                    <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-accent text-bg px-1">
                      封面
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); if (i <= coverIndex && coverIndex > 0) setCoverIndex(coverIndex - 1); }}
                    className="absolute -top-1.5 -right-1.5 bg-bg border border-border text-text-muted text-[10px] w-4 h-4 flex items-center justify-center hover:text-red-400"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">标题（批量上传时自动编号）</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="作品名称"
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">简介</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full bg-bg border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim transition-colors resize-y"
          placeholder="作品描述"
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">
          标签（逗号分隔，如：角色,场景,3D）
        </label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="标签"
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">
          时间（如：2024 年 3 月 / 2025 暑期）
        </label>
        <input
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="时间"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={createWork}
          disabled={submitting || uploading || uploadedFiles.length === 0}
          className="px-8 py-2.5 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
        >
          {submitting ? "提交中..." : uploadedFiles.length > 1 ? `发布作品（${uploadedFiles.length} 张图）` : "发布作品"}
        </button>
        {uploadedFiles.length > 0 && (
          <span className="text-xs text-text-muted">{uploadedFiles.length} 张图片，点击设封面，选中的已金色标记</span>
        )}
      </div>
    </div>
  );
}

function EditWorkForm({
  workId,
  onDone,
  onCancel,
  showMsg,
}: {
  workId: string;
  onDone: () => void;
  onCancel: () => void;
  showMsg: (text: string, ok: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [allImages, setAllImages] = useState<{ id: string; image_url: string; thumb_url: string; source: "existing" | "new"; size: number }[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [sizeWeight, setSizeWeight] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveStep, setSaveStep] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState("");

  useEffect(() => {
    async function load() {
      const [workRes, imagesRes] = await Promise.all([
        fetch(`/api/works/${workId}`),
        fetch(`/api/works/${workId}/images`),
      ]);
      if (workRes.ok) {
        const w = await workRes.json();
        setTitle(w.title || "");
        setDescription(w.description || "");
        setTags((w.tags || []).join(","));
        setWorkDate(w.work_date || "");
        setSizeWeight(w.size_weight ?? 1);
        setBaseUpdatedAt(typeof w.updated_at === "string" ? w.updated_at : "");
      }
      if (imagesRes.ok) {
        const imgs = await imagesRes.json();
        setAllImages(imgs.map((img: Record<string, unknown>) => ({
          id: (img.id as string) || "",
          image_url: img.image_url as string,
          thumb_url: img.thumb_url as string,
          source: "existing" as const,
          size: (img.image_size as number) || 0,
        })));
      }
      setLoading(false);
    }
    load();
  }, [workId]);

  const uploadNewFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const total = files.length;
    setUploading(true); setUploadTotal(total); setUploadDone(0);
    const fileArray = Array.from(files);
    const results = new Array<{ imageUrl: string; thumbUrl: string; size: number } | null>(total).fill(null);
    const failures: string[] = [];
    let done = 0;
    await Promise.all(
      fileArray.map(async (file, idx) => {
        try {
          const result = await uploadImageToR2(file);
          results[idx] = { imageUrl: result.imageUrl, thumbUrl: result.thumbUrl, size: result.size };
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "上传失败"}`);
        }
        done++; setUploadDone(done);
      })
    );
    const ordered = results.filter((r): r is NonNullable<typeof r> => r !== null);
    setAllImages((prev) => [...prev, ...ordered.map((r) => ({
      id: "", image_url: r.imageUrl, thumb_url: r.thumbUrl, source: "new" as const, size: r.size,
    }))]);
    setUploading(false);
    showMsg(
      formatUploadResult(ordered.length, total, failures, "张新图"),
      ordered.length > 0
    );
  };

  const removeImage = (i: number) => {
    const removed = allImages[i];
    if (removed?.source === "new") {
      cleanupUploadedFiles([{ imageUrl: removed.image_url, thumbUrl: removed.thumb_url }]).catch(() => {});
    }
    setAllImages((prev) => prev.filter((_, idx) => idx !== i));
    if (i <= coverIndex && coverIndex > 0) setCoverIndex((c) => c - 1);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStep("保存基础信息");
    const cover = allImages[coverIndex] || allImages[0];
    const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      const updateRes = await fetch(`/api/works/${workId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          tags: tagArray,
          workDate,
          imageUrl: cover?.image_url,
          thumbUrl: cover?.thumb_url,
          sizeWeight,
          expectedUpdatedAt: baseUpdatedAt,
        }),
      });
      if (!updateRes.ok) {
        if (updateRes.status === 409) {
          showMsg("检测到他人已修改该作品，请刷新后重试", false);
        } else {
          showMsg("更新作品信息失败", false);
        }
        setSaving(false);
        setSaveStep("");
        return;
      }

      setSaveStep("同步图片列表");
      const toInsert = allImages.filter((img) => img.image_url);
      const replaceRes = await fetch(`/api/works/${workId}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toInsert.map((img, idx) => ({
            imageUrl: img.image_url,
            thumbUrl: img.thumb_url,
            imageSize: img.size,
            sortOrder: idx,
          }))
        ),
      });
      if (!replaceRes.ok) {
        showMsg("图片列表同步失败，请重试", false);
        setSaving(false);
        setSaveStep("");
        return;
      }

      showMsg("已保存", true);
      setSaving(false);
      setSaveStep("");
      onDone();
    } catch {
      showMsg("保存过程中出现网络错误，请重试", false);
      setSaving(false);
      setSaveStep("");
    }
  };

  if (loading) return <div className="text-text-muted text-sm">加载中...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 mb-2">
        <button onClick={onCancel} className="text-sm text-text-muted hover:text-text">← 返回</button>
        <span className="text-sm text-text">编辑作品</span>
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">标题</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">简介</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full bg-bg border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim resize-y" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">标签</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">时间</label>
        <input value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">
          展示权重 {sizeWeight.toFixed(1)}（0.5=紧凑 1.0=默认 2.0=大）
        </label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={sizeWeight}
          onChange={(e) => setSizeWeight(parseFloat(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">所有图片 · 拖拽排序 · 点击设封面（{allImages.length} 张）</label>
        <div className="flex flex-wrap gap-2">
          {allImages.map((img, i) => (
            <div
              key={img.id || `new_${i}`}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx === null || dragIdx === i) return;
                const updated = [...allImages];
                const [moved] = updated.splice(dragIdx, 1);
                updated.splice(i, 0, moved);
                if (dragIdx === coverIndex) setCoverIndex(i);
                else if (dragIdx < coverIndex && i >= coverIndex) setCoverIndex(coverIndex - 1);
                else if (dragIdx > coverIndex && i <= coverIndex) setCoverIndex(coverIndex + 1);
                setAllImages(updated);
                setDragIdx(null);
              }}
              onClick={() => setCoverIndex(i)}
              className={`relative inline-block cursor-grab active:cursor-grabbing group ${i === coverIndex ? "ring-2 ring-accent" : ""}`}
            >
              <Image src={img.thumb_url} alt="" width={80} height={64} unoptimized className="w-20 h-16 object-cover border border-border" />
              {i === coverIndex && <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-accent text-bg px-1">封面</span>}
              <button onClick={(e) => { e.stopPropagation(); removeImage(i); }} className="absolute -top-1.5 -right-1.5 bg-bg border border-border text-text-muted text-[10px] w-4 h-4 flex items-center justify-center hover:text-red-400">x</button>
            </div>
          ))}
          {allImages.length === 0 && <p className="text-text-muted text-xs">暂无图片</p>}
        </div>
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">添加新图片</label>
        {uploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>上传中</span><span>{uploadDone} / {uploadTotal}</span>
            </div>
            <div className="h-2 bg-surface overflow-hidden">
              <div className="h-full bg-accent transition-all duration-300 ease-out" style={{ width: `${uploadTotal > 0 ? (uploadDone / uploadTotal) * 100 : 0}%` }} />
            </div>
          </div>
        ) : (
          <label className="inline-block px-6 py-6 border-2 border-dashed border-border text-text-muted text-sm cursor-pointer hover:border-accent-dim">
            点击选择（可多选）
            <input type="file" accept="image/*" multiple onChange={uploadNewFiles} className="hidden" />
          </label>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="px-8 py-2.5 bg-accent text-bg text-sm font-medium hover:bg-accent-dim disabled:opacity-50">{saving ? saveStep || "保存中..." : "保存修改"}</button>
        <button onClick={onCancel} className="px-6 py-2.5 border border-border text-text-muted text-sm hover:text-text">取消</button>
      </div>
    </div>
  );
}

