"use client";

import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";
import { cleanupUploadedFiles, uploadImageToR2 } from "@/lib/upload-client";
import {
  SOFTWARE_PRESETS,
  appendUploadedFiles,
  createEmptyWorkFormState,
  formatUploadResult,
  getIndexAfterRemoval,
  getMovedIndex,
  mergeSoftwareValues,
  moveUploadedFile,
  patchWorkFormState,
  removeUploadedFile,
  type WorkFormState,
} from "@/components/admin/work-form-state";

export default function AddWorkForm({
  formState,
  setFormState,
  onDone,
  showMsg,
}: {
  formState: WorkFormState;
  setFormState: Dispatch<SetStateAction<WorkFormState>>;
  onDone: () => void;
  showMsg: (text: string, ok: boolean) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [mediaTypes, setMediaTypes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    title,
    description,
    tags,
    software,
    softwareCustom,
    workDate,
    sizeWeight,
    uploadedFiles,
    coverIndex,
    uploading,
    uploadProgress,
    uploadTotal,
    uploadDone,
  } = formState;

  const updateForm = (patch: Partial<WorkFormState>) => {
    setFormState((current) => patchWorkFormState(current, patch));
  };

  const activePreviewIndex = uploadedFiles.length === 0 ? 0 : Math.min(previewIndex, uploadedFiles.length - 1);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const total = files.length;
    updateForm({ uploading: true, uploadProgress: "上传中", uploadTotal: total, uploadDone: 0 });

    const fileArray = Array.from(files);
    event.target.value = "";
    let completed = 0;
    const results: (Awaited<ReturnType<typeof uploadImageToR2>> | null)[] = new Array(fileArray.length).fill(null);
    const failures: string[] = [];

    await Promise.all(
      fileArray.map(async (file, index) => {
        try {
          results[index] = await uploadImageToR2(file);
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "上传失败"}`);
        }
        completed += 1;
        updateForm({ uploading: true, uploadProgress: "上传中", uploadTotal: total, uploadDone: completed });
      })
    );

    const ordered = results.filter((file): file is Awaited<ReturnType<typeof uploadImageToR2>> => file !== null);
    setFormState((current) => appendUploadedFiles(current, ordered));
    setMediaTypes((current) => [...current, ...ordered.map(() => "image")]);
    showMsg(formatUploadResult(ordered.length, total, failures, "个文件"), ordered.length > 0);
  };

  const createWork = async () => {
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || !cleanDescription || uploadedFiles.length === 0) {
      showMsg("请填写标题、简介，并上传至少一张图片", false);
      return;
    }

    setSubmitting(true);
    const cover = uploadedFiles[coverIndex] || uploadedFiles[0];

    try {
      const res = await fetch("/api/works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          description: cleanDescription,
          tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
          software: mergeSoftwareValues(software, softwareCustom),
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
        setFormState((current) => patchWorkFormState(current, { uploadedFiles: [], coverIndex: 0 }));
        showMsg("创建失败，已清理本次上传，请重新上传", false);
        return;
      }

      const { id: workId } = await res.json();
      const imagesRes = await fetch(`/api/works/${workId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          uploadedFiles.map((file, index) => ({
            imageUrl: file.imageUrl,
            thumbUrl: file.thumbUrl,
            mediaType: mediaTypes[index] || "image",
            imageSize: file.size,
            sortOrder: index,
          }))
        ),
      });

      if (!imagesRes.ok) {
        showMsg("作品已创建，但图片列表保存失败，请进入编辑页检查", false);
        onDone();
        return;
      }

      showMsg("作品已发布", true);
      setFormState(createEmptyWorkFormState());
      onDone();
    } catch {
      showMsg("发布失败，请检查网络后重试", false);
    } finally {
      setSubmitting(false);
    }
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
        <div className="mt-4">
          <label className="block text-sm text-text-muted mb-1">
            展示权重 {sizeWeight.toFixed(1)}（0.5=紧凑 1.0=默认 2.0=大）
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={sizeWeight}
            onChange={(event) => updateForm({ sizeWeight: parseFloat(event.target.value) })}
            className="w-full accent-accent"
          />
        </div>
        {uploadedFiles.length > 0 && !uploading && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-text-muted">拖拽排序 · 单击缩略图预览原图 · 按钮设封面</p>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={`${file.imageUrl}-${index}`}
                    draggable
                    onDragStart={() => setDragIdx(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIdx === null || dragIdx === index) return;
                      setFormState((current) => moveUploadedFile(current, dragIdx, index));
                      setPreviewIndex((current) => getMovedIndex(current, dragIdx, index));
                      setDragIdx(null);
                    }}
                    onClick={() => setPreviewIndex(index)}
                    className={`relative inline-block cursor-grab active:cursor-grabbing group border ${
                      index === activePreviewIndex ? "border-accent" : "border-border"
                    }`}
                  >
                    <Image
                      src={file.thumbUrl}
                      alt=""
                      width={80}
                      height={64}
                      unoptimized
                      className="w-20 h-16 object-cover"
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateForm({ coverIndex: index });
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
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMediaTypes((current) => {
                          const next = [...current];
                          next[index] = next[index] === "video" ? "image" : "video";
                          return next;
                        });
                      }}
                      className={`absolute top-0.5 right-0.5 text-[9px] px-1 border ${
                        mediaTypes[index] === "video"
                          ? "bg-accent text-bg border-accent"
                          : "bg-bg/80 text-text-muted border-border/70 hover:text-text"
                      }`}
                    >
                      {mediaTypes[index] === "video" ? "视频" : "图片"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void cleanupUploadedFiles([uploadedFiles[index]]);
                        setFormState((current) => removeUploadedFile(current, index));
                        setPreviewIndex((current) => getIndexAfterRemoval(current, index));
                        setMediaTypes((current) => current.filter((_, i) => i !== index));
                      }}
                      className="absolute -top-2 -right-2 bg-bg border border-border text-text-muted text-xs w-6 h-6 flex items-center justify-center hover:text-red-400"
                      aria-label={`删除第 ${index + 1} 张`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="hidden md:block border border-border/70 bg-surface/50 p-2">
                <p className="mb-2 text-[11px] tracking-[0.12em] uppercase text-text-muted">原图预览</p>
                <Image
                  src={(uploadedFiles[activePreviewIndex] || uploadedFiles[0]).imageUrl}
                  alt="原图预览"
                  width={840}
                  height={840}
                  unoptimized
                  className="w-full h-auto max-h-[18rem] object-contain bg-bg/70 border border-border/40"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">标题（批量上传时自动编号）</label>
        <input
          value={title}
          onChange={(event) => updateForm({ title: event.target.value })}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="作品名称"
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">简介</label>
        <textarea
          value={description}
          onChange={(event) => updateForm({ description: event.target.value })}
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
          onChange={(event) => updateForm({ tags: event.target.value })}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="标签"
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-2">
          使用软件（可多选）
        </label>
        <div className="flex flex-wrap gap-2">
          {SOFTWARE_PRESETS.map((name) => {
            const checked = software.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={checked}
                onClick={() => {
                  updateForm({
                    software: checked ? software.filter((item) => item !== name) : [...software, name],
                  });
                }}
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
          onChange={(event) => updateForm({ softwareCustom: event.target.value })}
          className="mt-2 w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="自定义软件（逗号分隔）"
        />
      </div>

      <div>
        <label className="block text-sm text-text-muted mb-1">
          时间（如：2024 年 3 月 / 2025 暑期）
        </label>
        <input
          value={workDate}
          onChange={(event) => updateForm({ workDate: event.target.value })}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="时间"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={createWork}
          disabled={submitting || uploading || uploadedFiles.length === 0}
          className="min-h-11 px-8 py-2.5 bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
        >
          {submitting ? "提交中..." : uploadedFiles.length > 1 ? `发布作品（${uploadedFiles.length} 张图）` : "发布作品"}
        </button>
        {uploadedFiles.length > 0 && (
          <span className="text-xs text-text-muted">{uploadedFiles.length} 张图片，单击缩略图可预览原图，封面用按钮单独设置</span>
        )}
      </div>
    </div>
  );
}
