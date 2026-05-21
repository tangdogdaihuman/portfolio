"use client";

import { useState, useEffect, useCallback } from "react";

interface Work {
  id: string;
  title: string;
  description: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  pinned: boolean;
  sort_order: number;
  created_at: string;
}

export default function AdminPage() {
  const [tab, setTab] = useState<"works" | "intro" | "add">("works");
  const [works, setWorks] = useState<Work[]>([]);
  const [intro, setIntro] = useState("");
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
        {(["works", "add", "intro"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm tracking-wide transition-colors ${
              tab === t
                ? "text-accent border-b-2 border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            {t === "works" ? "作品列表" : t === "add" ? "新增作品" : "个人介绍"}
          </button>
        ))}
      </div>

      {tab === "intro" && <IntroForm intro={intro} setIntro={setIntro} onSave={saveIntro} loading={loading} />}
      {tab === "add" && <AddWorkForm onDone={() => { refresh(); setTab("works"); }} showMsg={showMsg} />}
      {tab === "works" && (
        <WorkList
          works={works}
          onDelete={deleteWork}
          onTogglePin={togglePin}
        />
      )}
    </div>
  );
}

function IntroForm({
  intro,
  setIntro,
  onSave,
  loading,
}: {
  intro: string;
  setIntro: (v: string) => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-text-muted mb-2">
        个人介绍（支持换行，前台按段落显示）
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

function AddWorkForm({
  onDone,
  showMsg,
}: {
  onDone: () => void;
  showMsg: (text: string, ok: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      setImageUrl(data.imageUrl);
      setThumbUrl(data.thumbUrl);
      showMsg("上传成功", true);
    } else {
      showMsg("上传失败", false);
    }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!title || !description || !imageUrl || !thumbUrl) {
      showMsg("请填写所有字段并上传图片", false);
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        imageUrl,
        thumbUrl,
        pinned: false,
        sortOrder: 0,
      }),
    });
    if (res.ok) {
      showMsg("作品已添加", true);
      onDone();
    } else {
      showMsg("添加失败", false);
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-text-muted mb-1">图片</label>
        {thumbUrl ? (
          <div className="relative inline-block">
            <img
              src={thumbUrl}
              alt="预览"
              className="max-w-xs border border-border"
            />
            <button
              onClick={() => { setImageUrl(""); setThumbUrl(""); }}
              className="absolute top-1 right-1 text-text-muted bg-bg/80 px-2 py-0.5 text-xs"
            >
              移除
            </button>
          </div>
        ) : (
          <label className="inline-block px-6 py-10 border-2 border-dashed border-border text-text-muted text-sm cursor-pointer hover:border-accent-dim transition-colors">
            {uploading ? "上传中..." : "点击选择图片"}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">标题</label>
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

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="px-6 py-2 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
      >
        {submitting ? "提交中..." : "发布作品"}
      </button>
    </div>
  );
}

function WorkList({
  works,
  onDelete,
  onTogglePin,
}: {
  works: Work[];
  onDelete: (id: string) => void;
  onTogglePin: (work: Work) => void;
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
            <p className="text-text-muted text-sm mt-1 truncate">
              {work.description}
            </p>
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
