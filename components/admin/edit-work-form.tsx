"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cleanupUploadedFiles, uploadImageToR2 } from "@/lib/upload-client";
import {
  SOFTWARE_PRESETS,
  formatUploadResult,
  getIndexAfterRemoval,
  getMovedIndex,
  mergeSoftwareValues,
} from "@/components/admin/work-form-state";

interface EditableImage {
  id: string;
  image_url: string;
  thumb_url: string;
  source: "existing" | "new";
  size: number;
  media_type: string;
}

function moveEditableImages(images: EditableImage[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= images.length ||
    toIndex >= images.length ||
    fromIndex === toIndex
  ) {
    return images;
  }

  const updated = [...images];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  return updated;
}

export default function EditWorkForm({
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
  const [software, setSoftware] = useState<string[]>([]);
  const [softwareCustom, setSoftwareCustom] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [allImages, setAllImages] = useState<EditableImage[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
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
    let cancelled = false;

    async function load() {
      try {
        const [workRes, imagesRes] = await Promise.all([
          fetch(`/api/works/${workId}`),
          fetch(`/api/works/${workId}/images`),
        ]);

        if (cancelled) return;

        if (workRes.ok) {
          const work = await workRes.json();
          if (cancelled) return;
          setTitle(work.title || "");
          setDescription(work.description || "");
          setTags((work.tags || []).join(","));
          const softwareValues = Array.isArray(work.software)
            ? work.software.map((item: unknown) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
            : [];
          setSoftware(softwareValues.filter((item: string) => SOFTWARE_PRESETS.includes(item as (typeof SOFTWARE_PRESETS)[number])));
          setSoftwareCustom(softwareValues.filter((item: string) => !SOFTWARE_PRESETS.includes(item as (typeof SOFTWARE_PRESETS)[number])).join(", "));
          setWorkDate(work.work_date || "");
          setSizeWeight(work.size_weight ?? 1);
          setBaseUpdatedAt(typeof work.updated_at === "string" ? work.updated_at : "");
        }

        if (imagesRes.ok) {
          const images = await imagesRes.json();
          if (cancelled) return;
          setAllImages(
            images.map((image: Record<string, unknown>) => ({
              id: (image.id as string) || "",
              image_url: image.image_url as string,
              thumb_url: image.thumb_url as string,
              source: "existing" as const,
              size: (image.image_size as number) || 0,
              media_type: (image.media_type as string) || (/\.(mp4|webm|mov|avi|mkv)$/i.test((image.image_url as string) || "") ? "video" : "image"),
            }))
          );
        }
      } catch {
        if (!cancelled) showMsg("加载作品失败，请重试", false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [showMsg, workId]);

  const activePreviewIndex = allImages.length === 0 ? 0 : Math.min(previewIndex, allImages.length - 1);

  const uploadNewFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const total = files.length;
    setUploading(true);
    setUploadTotal(total);
    setUploadDone(0);

    const fileArray = Array.from(files);
    event.target.value = "";
    const results: (Awaited<ReturnType<typeof uploadImageToR2>> | null)[] = new Array(fileArray.length).fill(null);
    const failures: string[] = [];
    let done = 0;

    await Promise.all(
      fileArray.map(async (file, index) => {
        try {
          const result = await uploadImageToR2(file);
          results[index] = result;
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "上传失败"}`);
        }
        done += 1;
        setUploadDone(done);
      })
    );

    const ordered = results.filter((result): result is NonNullable<(typeof results)[number]> => result !== null);
    const videoExt = /\.(mp4|webm|mov|avi|mkv)$/i;
    setAllImages((current) => [
      ...current,
      ...ordered.map((result) => ({
        id: "",
        image_url: result.imageUrl,
        thumb_url: result.thumbUrl,
        source: "new" as const,
        size: result.size,
        media_type: videoExt.test(result.originalFileName) ? "video" : "image",
      })),
    ]);
    setUploading(false);
    showMsg(formatUploadResult(ordered.length, total, failures, "张新图"), ordered.length > 0);
  };

  const removeImage = (index: number) => {
    const removed = allImages[index];
    if (removed?.source === "new") {
      cleanupUploadedFiles([{ imageUrl: removed.image_url, thumbUrl: removed.thumb_url }]).catch(() => {});
    }
    setAllImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setCoverIndex((current) => (allImages.length <= 1 ? 0 : getIndexAfterRemoval(current, index)));
    setPreviewIndex((current) => getIndexAfterRemoval(current, index));
  };

  const handleSave = async () => {
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || !cleanDescription || allImages.length === 0) {
      showMsg("请保留标题、简介和至少一张图片", false);
      return;
    }

    setSaving(true);
    setSaveStep("保存基础信息");

    const cover = allImages[coverIndex] || allImages[0];
    try {
      const updateRes = await fetch(`/api/works/${workId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          description: cleanDescription,
          tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
          software: mergeSoftwareValues(software, softwareCustom),
          workDate,
          imageUrl: cover.image_url,
          thumbUrl: cover.thumb_url,
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

      const updateBody = await updateRes.json().catch(() => null) as { updatedAt?: string } | null;
      if (updateBody?.updatedAt) {
        setBaseUpdatedAt(updateBody.updatedAt);
      }

      setSaveStep("同步图片列表");
      const replaceRes = await fetch(`/api/works/${workId}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allImages
            .filter((image) => image.image_url)
            .map((image, index) => ({
              imageUrl: image.image_url,
              thumbUrl: image.thumb_url,
              mediaType: image.media_type,
              imageSize: image.size,
              sortOrder: index,
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
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">简介</label>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full bg-bg border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim resize-y" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">标签</label>
        <input value={tags} onChange={(event) => setTags(event.target.value)} className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim" />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-2">使用软件（可多选）</label>
        <div className="flex flex-wrap gap-2">
          {SOFTWARE_PRESETS.map((name) => {
            const checked = software.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={checked}
                onClick={() => setSoftware(checked ? software.filter((item) => item !== name) : [...software, name])}
                className={`px-3 py-1.5 text-xs border transition-colors ${
                  checked
                    ? "border-accent text-accent bg-surface"
                    : "border-border text-text-muted hover:text-text"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <input
          value={softwareCustom}
          onChange={(event) => setSoftwareCustom(event.target.value)}
          className="mt-2 w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim"
          placeholder="自定义软件（逗号分隔）"
        />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">时间</label>
        <input value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim" />
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
          onChange={(event) => setSizeWeight(parseFloat(event.target.value))}
          className="w-full accent-accent"
        />
      </div>
      <div>
        <label className="block text-sm text-text-muted mb-1">所有图片 · 拖拽排序 · 单击缩略图预览原图（{allImages.length} 张）</label>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex flex-wrap gap-2">
            {allImages.map((image, index) => (
              <div
                key={image.id || `new_${index}`}
                draggable
                onDragStart={() => setDragIdx(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIdx === null || dragIdx === index) return;
                  setAllImages((current) => moveEditableImages(current, dragIdx, index));
                  setCoverIndex((current) => getMovedIndex(current, dragIdx, index));
                  setPreviewIndex((current) => getMovedIndex(current, dragIdx, index));
                  setDragIdx(null);
                }}
                onClick={() => setPreviewIndex(index)}
                className={`relative inline-block cursor-grab active:cursor-grabbing group border ${
                  index === activePreviewIndex ? "border-accent" : "border-border"
                }`}
              >
                <Image src={image.thumb_url} alt="" width={80} height={64} unoptimized className="w-20 h-16 object-cover" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCoverIndex(index);
                  }}
                  className={`absolute bottom-0.5 left-0.5 text-[9px] px-1 border ${
                    index === coverIndex
                      ? "bg-accent text-bg border-accent"
                      : "bg-bg/80 text-text-muted border-border/70 hover:text-text"
                  }`}
                >
                  封面
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    removeImage(index);
                  }}
                  className="absolute -top-2 -right-2 bg-bg border border-border text-text-muted text-xs w-6 h-6 flex items-center justify-center hover:text-red-400"
                  aria-label={`删除第 ${index + 1} 张`}
                >
                  ×
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAllImages((current) => current.map((img, i) =>
                      i === index ? { ...img, media_type: img.media_type === "video" ? "image" : "video" } : img
                    ));
                  }}
                  className={`absolute top-0.5 right-0.5 text-[9px] px-1 border ${
                    image.media_type === "video"
                      ? "bg-accent text-bg border-accent"
                      : "bg-bg/80 text-text-muted border-border/70 hover:text-text"
                  }`}
                >
                  {image.media_type === "video" ? "视频" : "图片"}
                </button>
              </div>
            ))}
            {allImages.length === 0 && <p className="text-text-muted text-xs">暂无图片</p>}
          </div>
          {allImages.length > 0 && (
            <div className="hidden md:block border border-border/70 bg-surface/50 p-2">
              <p className="mb-2 text-[11px] tracking-[0.12em] uppercase text-text-muted">原图预览</p>
              <Image
                src={(allImages[activePreviewIndex] || allImages[0]).image_url}
                alt="原图预览"
                width={840}
                height={840}
                unoptimized
                className="w-full h-auto max-h-[18rem] object-contain bg-bg/70 border border-border/40"
              />
            </div>
          )}
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
