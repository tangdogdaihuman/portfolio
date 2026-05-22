"use client";

import { useState, useEffect, useCallback } from "react";

interface Work {
  id: string;
  title: string;
  description: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  work_date: string;
  image_size: number;
  pinned: boolean;
  sort_order: number;
  created_at: string;
}

export default function AdminPage() {
  const [tab, setTab] = useState<"works" | "intro" | "add" | "storage" | "edit" | "detail">("works");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    title: "",
    description: "",
    tags: "",
    workDate: "",
    uploadedFiles: [],
    coverIndex: 0,
    uploading: false,
    uploadProgress: "",
    uploadTotal: 0,
    uploadDone: 0,
  });
  const [works, setWorks] = useState<Work[]>([]);
  const [intro, setIntro] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  const refresh = useCallback(() => {
    fetch("/api/works")
      .then((r) => { if (r.ok) r.json().then(setWorks); });
    fetch("/api/intro")
      .then((r) => { if (r.ok) r.json().then((d) => setIntro(d.content)); });
    fetch("/api/details")
      .then((r) => { if (r.ok) r.json().then((d) => setDetails(d.content)); });
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

  const saveDetails = async () => {
    setLoading(true);
    const res = await fetch("/api/details", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: details }),
    });
    showMsg(res.ok ? "已保存" : "保存失败", res.ok);
    setLoading(false);
  };

  const deleteWork = async (id: string) => {
    if (!confirm("确定删除？")) return;
    const res = await fetch(`/api/works/${id}`, { method: "DELETE" });
    if (res.ok) {
      refresh();
      showMsg("已删除", true);
    }
  };

  const togglePin = async (work: Work) => {
    const res = await fetch(`/api/works/${work.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !work.pinned }),
    });
    if (res.ok) refresh();
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

      <div className="flex gap-1 mb-8 border-b border-border">
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

      {tab === "intro" && <IntroForm intro={intro} setIntro={setIntro} onSave={saveIntro} loading={loading} />}
      {tab === "detail" && <IntroForm intro={details} setIntro={setDetails} onSave={saveDetails} loading={loading} label="详细介绍（支持换行，前台按段落显示）" />}
      {tab === "add" && <AddWorkForm formState={formState} setFormState={setFormState} onDone={() => { refresh(); setTab("works"); }} showMsg={showMsg} />}
      {tab === "works" && (
        <WorkList
          works={works}
          onDelete={deleteWork}
          onTogglePin={togglePin}
          onEdit={(id) => { setEditingId(id); setTab("edit"); }}
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

interface UploadedFile {
  imageUrl: string;
  thumbUrl: string;
  size: number;
  fileName: string;
}

interface FormState {
  title: string;
  description: string;
  tags: string;
  workDate: string;
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

  const { title, description, tags, workDate, uploadedFiles, coverIndex, uploading, uploadProgress, uploadTotal, uploadDone } = formState;
  const setTitle = (v: string) => setFormState({ ...formState, title: v });
  const setDescription = (v: string) => setFormState({ ...formState, description: v });
  const setTags = (v: string) => setFormState({ ...formState, tags: v });
  const setWorkDate = (v: string) => setFormState({ ...formState, workDate: v });
  const setUploadedFiles = (v: UploadedFile[]) => setFormState({ ...formState, uploadedFiles: v });
  const setCoverIndex = (v: number) => setFormState({ ...formState, coverIndex: v });
  const setUp = (p: Partial<FormState>) => setFormState({ ...formState, ...p });

  const uploadOneFile = async (file: File): Promise<UploadedFile> => {
    const presignedRes = await fetch("/api/upload/presigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type }),
    });
    if (!presignedRes.ok) throw new Error("presigned");
    const { uploadUrl, originalKey } = await presignedRes.json();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadRes.ok) throw new Error("upload");

    const processRes = await fetch("/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalKey }),
    });
    if (!processRes.ok) throw new Error("process");
    const data = await processRes.json();

    return {
      imageUrl: data.imageUrl,
      thumbUrl: data.thumbUrl,
      size: file.size,
      fileName: file.name.replace(/\.[^.]+$/, ""),
    };
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const total = files.length;
    setUp({ uploading: true, uploadProgress: "上传中", uploadTotal: total, uploadDone: 0 });

    const fileArray = Array.from(files);
    let completed = 0;
    const results: UploadedFile[] = [];

    await Promise.all(
      fileArray.map(async (file) => {
        try {
          const result = await uploadOneFile(file);
          results.push(result);
        } catch {}
        completed++;
        setUp({ uploading: true, uploadProgress: "上传中", uploadTotal: total, uploadDone: completed });
      })
    );

    setFormState({
      ...formState,
      uploadedFiles: [...formState.uploadedFiles, ...results],
      uploading: false,
      uploadProgress: "",
      uploadTotal: 0,
      uploadDone: 0,
    });
    showMsg(`${results.length}/${total} 个文件上传成功`, results.length > 0);
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
      }),
    });
    if (!res.ok) {
      showMsg("创建失败", false);
      setSubmitting(false);
      return;
    }

    const { id: workId } = await res.json();

    // Add all images in current order
    if (uploadedFiles.length > 0) {
      await fetch(`/api/works/${workId}/images`, {
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
    }

    showMsg("作品已发布", true);
    setFormState({
      title: "", description: "", tags: "", workDate: "",
      uploadedFiles: [], coverIndex: 0,
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
                  <img
                    src={f.thumbUrl}
                    alt=""
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

function WorkList({
  works,
  onDelete,
  onTogglePin,
  onEdit,
}: {
  works: Work[];
  onDelete: (id: string) => void;
  onTogglePin: (work: Work) => void;
  onEdit: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {works.length === 0 && (
        <p className="text-text-muted text-sm">暂无作品</p>
      )}
      {works.map((work) => (
        <div
          key={work.id}
          className="flex items-start gap-4 bg-bg border border-border p-4"
        >
          <img
            src={work.thumb_url}
            alt={work.title}
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
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={() => onTogglePin(work)}
              className="text-xs text-text-muted hover:text-accent transition-colors"
            >
              {work.pinned ? "取消置顶" : "置顶"}
            </button>
            <button
              onClick={() => onEdit(work.id)}
              className="text-xs text-text-muted hover:text-accent transition-colors"
            >
              编辑
            </button>
            <button
              onClick={() => onDelete(work.id)}
              className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function StoragePanel({ works }: { works: Work[] }) {
  const getSize = (w: Work) => ((w as unknown as Record<string, unknown>).total_size as number) || w.image_size || 0;
  const totalBytes = works.reduce((sum, w) => sum + getSize(w), 0);
  const maxGB = 10;
  const usedGB = totalBytes / (1024 * 1024 * 1024);
  const pct = Math.min((usedGB / maxGB) * 100, 100);

  return (
    <div>
      <div className="bg-bg border border-border p-6 mb-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-2xl font-display text-text">{formatSize(totalBytes)}</p>
            <p className="text-xs text-text-muted mt-1">已用 / {maxGB} GB 总额</p>
          </div>
          <p className="text-sm text-accent-dim">{usedGB.toFixed(2)} GB</p>
        </div>
        <div className="h-2 bg-surface overflow-hidden">
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: pct > 80
                ? "linear-gradient(90deg, #d4a574, #c44)"
                : "linear-gradient(90deg, #d4a574, #8b6b4a)",
            }}
          />
        </div>
        <p className="text-xs text-text-muted mt-2">{pct.toFixed(1)}% 已使用</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-text-muted mb-4">各作品占用</p>
        {works
          .filter((w) => (w.image_size || 0) > 0)
          .sort((a, b) => getSize(b) - getSize(a))
          .map((work) => {
            const size = getSize(work);
            const wpct = totalBytes > 0 ? (size / totalBytes) * 100 : 0;
            return (
              <div key={work.id} className="bg-bg border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text truncate mr-4">{work.title}</span>
                  <span className="text-xs text-accent-dim whitespace-nowrap">
                    {formatSize(size)} ({wpct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1.5 bg-surface overflow-hidden">
                  <div
                    className="h-full bg-accent-dim/40"
                    style={{ width: `${Math.max(wpct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        {works.every((w) => !w.image_size) && (
          <p className="text-text-muted text-sm">暂无数据，上传作品后显示</p>
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
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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
    const results: { imageUrl: string; thumbUrl: string; size: number }[] = [];
    let done = 0;
    await Promise.all(
      Array.from(files).map(async (file) => {
        try {
          const presignedRes = await fetch("/api/upload/presigned", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentType: file.type }),
          });
          if (!presignedRes.ok) { done++; setUploadDone(done); return; }
          const { uploadUrl, originalKey } = await presignedRes.json();
          await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
          const processRes = await fetch("/api/upload/process", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ originalKey }),
          });
          if (processRes.ok) {
            const data = await processRes.json();
            results.push({ imageUrl: data.imageUrl, thumbUrl: data.thumbUrl, size: file.size });
          }
        } catch {}
        done++; setUploadDone(done);
      })
    );
    setAllImages((prev) => [...prev, ...results.map((r) => ({
      id: "", image_url: r.imageUrl, thumb_url: r.thumbUrl, source: "new" as const, size: r.size,
    }))]);
    setUploading(false);
    showMsg(`${results.length}/${total} 张新图上传成功`, results.length > 0);
  };

  const removeImage = (i: number) => {
    setAllImages((prev) => prev.filter((_, idx) => idx !== i));
    if (i <= coverIndex && coverIndex > 0) setCoverIndex((c) => c - 1);
  };

  const handleSave = async () => {
    setSaving(true);
    const cover = allImages[coverIndex];
    const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean);
    await fetch(`/api/works/${workId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, tags: tagArray, workDate, imageUrl: cover?.image_url, thumbUrl: cover?.thumb_url }),
    });
    await fetch(`/api/works/${workId}/images`, { method: "DELETE" });
    const toInsert = allImages.filter((img) => img.image_url);
    if (toInsert.length > 0) {
      await fetch(`/api/works/${workId}/images`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toInsert.map((img) => ({ imageUrl: img.image_url, thumbUrl: img.thumb_url, imageSize: img.size }))),
      });
    }
    showMsg("已保存", true);
    setSaving(false);
    onDone();
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
              <img src={img.thumb_url} alt="" className="w-20 h-16 object-cover border border-border" />
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
        <button onClick={handleSave} disabled={saving} className="px-8 py-2.5 bg-accent text-bg text-sm font-medium hover:bg-accent-dim disabled:opacity-50">{saving ? "保存中..." : "保存修改"}</button>
        <button onClick={onCancel} className="px-6 py-2.5 border border-border text-text-muted text-sm hover:text-text">取消</button>
      </div>
    </div>
  );
}
