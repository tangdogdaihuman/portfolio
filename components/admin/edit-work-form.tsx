"use client";

import { useCallback, useEffect, useState } from "react";
import { cleanupUploadedFiles, type UploadedFile } from "@/lib/upload-client";
import { UPLOAD_LIMIT_HINT } from "@/lib/upload-policy";
import {
  SOFTWARE_PRESETS,
  createEditWorkFormState,
  mergeSoftwareValues,
  moveEditableImage,
  nextTempImageId,
  patchEditWorkFormState,
  removeEditableImage,
  type EditWorkFormState,
} from "@/components/admin/work-form-state";
import {
  SoftwarePicker,
  SortableThumbGrid,
  UploadFailureList,
  UploadProgressBar,
  useMultiFileUpload,
} from "@/components/admin/work-form-shared";

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv)$/i;

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
  const [form, setForm] = useState<EditWorkFormState>(createEditWorkFormState);

  const updateForm = (patch: Partial<EditWorkFormState>) => {
    setForm((current) => patchEditWorkFormState(current, patch));
  };

  const {
    title,
    description,
    tags,
    software,
    softwareCustom,
    workDate,
    sizeWeight,
    allImages,
    coverIndex,
    previewIndex,
    loading,
    saving,
    saveStep,
    baseUpdatedAt,
    conflict,
  } = form;

  const load = useCallback(async () => {
    try {
      const [workRes, imagesRes] = await Promise.all([
        fetch(`/api/works/${workId}`),
        fetch(`/api/works/${workId}/images`),
      ]);

      const patch: Partial<EditWorkFormState> = { loading: false, conflict: false };

      let workImageUrl = "";
      let workThumbUrl = "";

      if (workRes.ok) {
        const work = await workRes.json();
        workImageUrl = (work.image_url as string) || "";
        workThumbUrl = (work.thumb_url as string) || "";
        const softwareValues = Array.isArray(work.software)
          ? work.software.map((item: unknown) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
          : [];
        patch.title = work.title || "";
        patch.description = work.description || "";
        patch.tags = (work.tags || []).join(",");
        patch.software = softwareValues.filter((item: string) => SOFTWARE_PRESETS.includes(item as (typeof SOFTWARE_PRESETS)[number]));
        patch.softwareCustom = softwareValues.filter((item: string) => !SOFTWARE_PRESETS.includes(item as (typeof SOFTWARE_PRESETS)[number])).join(", ");
        patch.workDate = work.work_date || "";
        patch.sizeWeight = work.size_weight ?? 1;
        patch.baseUpdatedAt = typeof work.updated_at === "string" ? work.updated_at : "";
      }

      if (imagesRes.ok) {
        const images: Array<Record<string, unknown>> = await imagesRes.json();
        patch.allImages = images.map((image: Record<string, unknown>) => ({
          id: (image.id as string) || nextTempImageId(),
          image_url: image.image_url as string,
          thumb_url: image.thumb_url as string,
          source: "existing" as const,
          size: (image.image_size as number) || 0,
          media_type: (image.media_type as string) || (VIDEO_EXT.test((image.image_url as string) || "") ? "video" : "image"),
        }));
        const coverIdx = images.findIndex(
          (img: Record<string, unknown>) =>
            (img.image_url as string) === workImageUrl || (img.thumb_url as string) === workThumbUrl
        );
        patch.coverIndex = coverIdx >= 0 ? coverIdx : 0;
        patch.previewIndex = 0;
      }

      setForm((current) => patchEditWorkFormState(current, patch));
    } catch {
      showMsg("加载作品失败，请重试", false);
      updateForm({ loading: false });
    }
  }, [showMsg, workId]);

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await load();
      } finally {
        if (cancelled) return;
      }
    }

    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleUploaded = useCallback((files: UploadedFile[]) => {
    setForm((current) => patchEditWorkFormState(current, {
      allImages: [
        ...current.allImages,
        ...files.map((result) => ({
          id: nextTempImageId(),
          image_url: result.imageUrl,
          thumb_url: result.thumbUrl,
          source: "new" as const,
          size: result.size,
          media_type: result.mediaType,
        })),
      ],
    }));
  }, []);

  const {
    uploading,
    totalCount,
    doneCount,
    totalBytes,
    doneBytes,
    failures,
    startUpload,
    retryFailure,
    dismissFailure,
  } = useMultiFileUpload({ onUploaded: handleUploaded });

  const uploadNewFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    event.target.value = "";
    startUpload(fileArray);
  };

  const removeImage = (index: number) => {
    const removed = allImages[index];
    if (removed?.source === "new") {
      cleanupUploadedFiles([{ imageUrl: removed.image_url, thumbUrl: removed.thumb_url }]).catch(() => {});
    }
    setForm((current) => removeEditableImage(current, index));
  };

  const handleSave = async () => {
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || !cleanDescription || allImages.length === 0) {
      showMsg("请保留标题、简介和至少一张图片", false);
      return;
    }

    updateForm({ saving: true, saveStep: "保存作品", conflict: false });

    const cover = allImages[coverIndex] || allImages[0];
    try {
      const saveRes = await fetch(`/api/works/${workId}/save`, {
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
          imageSize: cover.size,
          sizeWeight,
          expectedUpdatedAt: baseUpdatedAt,
          images: allImages
            .filter((image) => image.image_url)
            .map((image, index) => ({
              imageUrl: image.image_url,
              thumbUrl: image.thumb_url,
              mediaType: image.media_type,
              imageSize: image.size,
              sortOrder: index,
            })),
        }),
      });

      if (!saveRes.ok) {
        if (saveRes.status === 409) {
          updateForm({ saving: false, saveStep: "", conflict: true });
        } else {
          showMsg("保存作品失败", false);
          updateForm({ saving: false, saveStep: "" });
        }
        return;
      }

      const saveBody = await saveRes.json().catch(() => null) as { updatedAt?: string } | null;
      updateForm({
        saving: false,
        saveStep: "",
        ...(saveBody?.updatedAt ? { baseUpdatedAt: saveBody.updatedAt } : {}),
      });

      showMsg("已保存", true);
      onDone();
    } catch {
      showMsg("保存过程中出现网络错误，请重试", false);
      updateForm({ saving: false, saveStep: "" });
    }
  };

  if (loading) return <div className="text-text-muted text-sm">加载中...</div>;

  return (
    <div className="glass space-y-5 rounded-[28px] p-5 md:p-7">
      <div className="flex items-center gap-4 mb-2">
        <button onClick={onCancel} className="text-sm text-text-muted hover:text-text">← 返回</button>
        <span className="text-sm text-text">编辑作品</span>
      </div>
      {conflict && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3" role="alert">
          <span className="flex-1 text-sm text-text-muted">检测到他人已修改该作品，当前编辑内容已过期。</span>
          <button
            type="button"
            onClick={() => {
              updateForm({ loading: true });
              void load();
            }}
            className="text-sm text-accent hover:underline"
          >
            放弃本地修改并重新加载
          </button>
        </div>
      )}
      <div>
        <label htmlFor="edit-work-title" className="block text-sm text-text-muted mb-1">标题</label>
        <input id="edit-work-title" value={title} onChange={(event) => updateForm({ title: event.target.value })} className="glass-chip w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none" />
      </div>
      <div>
        <label htmlFor="edit-work-description" className="block text-sm text-text-muted mb-1">简介</label>
        <textarea id="edit-work-description" value={description} onChange={(event) => updateForm({ description: event.target.value })} rows={4} className="glass-chip w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none resize-y" />
      </div>
      <div>
        <label htmlFor="edit-work-tags" className="block text-sm text-text-muted mb-1">标签</label>
        <input id="edit-work-tags" value={tags} onChange={(event) => updateForm({ tags: event.target.value })} className="glass-chip w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none" />
      </div>
      <div>
        <span className="block text-sm text-text-muted mb-2">使用软件（可多选）</span>
        <SoftwarePicker
          software={software}
          softwareCustom={softwareCustom}
          customInputId="edit-work-software-custom"
          onChange={(patch) => updateForm(patch)}
        />
      </div>
      <div>
        <label htmlFor="edit-work-date" className="block text-sm text-text-muted mb-1">时间</label>
        <input id="edit-work-date" value={workDate} onChange={(event) => updateForm({ workDate: event.target.value })} className="glass-chip w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors focus:border-accent/50 focus:outline-none" />
      </div>
      <div>
        <label htmlFor="edit-work-size-weight" className="block text-sm text-text-muted mb-1">
          展示权重 {sizeWeight.toFixed(1)}（0.5=紧凑 1.0=默认 2.0=大）
        </label>
        <input
          id="edit-work-size-weight"
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={sizeWeight}
          onChange={(event) => updateForm({ sizeWeight: parseFloat(event.target.value) })}
          className="w-full accent-accent"
        />
      </div>
      <div>
        <span className="block text-sm text-text-muted mb-1">所有图片 · 拖拽排序 · 单击缩略图预览原图（{allImages.length} 张）</span>
        <SortableThumbGrid
          files={allImages.map((image) => ({
            key: image.id,
            imageUrl: image.image_url,
            thumbUrl: image.thumb_url,
            mediaType: image.media_type,
          }))}
          coverIndex={coverIndex}
          previewIndex={previewIndex}
          onPreview={(index) => updateForm({ previewIndex: index })}
          onCover={(index) => updateForm({ coverIndex: index })}
          onRemove={removeImage}
          onMove={(fromIndex, toIndex) => {
            setForm((current) => moveEditableImage(current, fromIndex, toIndex));
          }}
        />
      </div>
      <div>
        <label htmlFor="edit-work-files" className="block text-sm text-text-muted mb-1">添加新图片（{UPLOAD_LIMIT_HINT}）</label>
        {uploading ? (
          <UploadProgressBar label="上传中" doneCount={doneCount} totalCount={totalCount} doneBytes={doneBytes} totalBytes={totalBytes} />
        ) : (
          <label htmlFor="edit-work-files" className="block cursor-pointer rounded-[24px] border-2 border-dashed border-border/70 px-6 py-6 text-center text-sm text-text-muted transition-colors hover:border-accent/50 hover:text-text">
            点击选择（可多选）
          </label>
        )}
        <input id="edit-work-files" type="file" accept="image/*,video/*" multiple onChange={uploadNewFiles} className="hidden" />
        <UploadFailureList failures={failures} onRetry={retryFailure} onDismiss={dismissFailure} />
      </div>
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="min-h-11 rounded-full bg-accent px-8 py-2.5 text-sm font-medium text-on-accent shadow-[0_14px_36px_-10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] transition-[transform,box-shadow] duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">{saving ? saveStep || "保存中..." : "保存修改"}</button>
        <button onClick={onCancel} className="glass-chip rounded-full px-6 py-2.5 text-sm text-text-muted transition-colors hover:text-text">取消</button>
      </div>
    </div>
  );
}
