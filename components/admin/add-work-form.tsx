"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { cleanupUploadedFiles, type UploadedFile } from "@/lib/upload-client";
import { UPLOAD_LIMIT_HINT } from "@/lib/upload-policy";
import {
  appendUploadedFiles,
  createEmptyWorkFormState,
  getIndexAfterRemoval,
  getMovedIndex,
  mergeSoftwareValues,
  moveUploadedFile,
  patchWorkFormState,
  removeUploadedFile,
  type WorkFormState,
} from "@/components/admin/work-form-state";
import {
  SoftwarePicker,
  SortableThumbGrid,
  UploadFailureList,
  UploadProgressBar,
  useMultiFileUpload,
} from "@/components/admin/work-form-shared";

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
  const [previewIndex, setPreviewIndex] = useState(0);
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
  } = formState;

  const updateForm = (patch: Partial<WorkFormState>) => {
    setFormState((current) => patchWorkFormState(current, patch));
  };

  const handleUploaded = useCallback((files: UploadedFile[]) => {
    setFormState((current) => appendUploadedFiles(current, files));
  }, [setFormState]);

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

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    event.target.value = "";
    startUpload(fileArray);
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
          images: uploadedFiles.map((file, index) => ({
            imageUrl: file.imageUrl,
            thumbUrl: file.thumbUrl,
            mediaType: file.mediaType,
            imageSize: file.size,
            sortOrder: index,
          })),
        }),
      });

      if (!res.ok) {
        await cleanupUploadedFiles(uploadedFiles);
        setFormState((current) => patchWorkFormState(current, { uploadedFiles: [], coverIndex: 0 }));
        showMsg("创建失败，已清理本次上传，请重新上传", false);
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
        <label htmlFor="add-work-files" className="block text-sm text-text-muted mb-1">
          图片（可多选，{UPLOAD_LIMIT_HINT}）
        </label>
        {uploading ? (
          <UploadProgressBar label="上传中" doneCount={doneCount} totalCount={totalCount} doneBytes={doneBytes} totalBytes={totalBytes} />
        ) : (
          <label htmlFor="add-work-files" className="inline-block px-6 py-10 border-2 border-dashed border-border text-text-muted text-sm cursor-pointer hover:border-accent-dim transition-colors">
            点击选择图片（可多选）
          </label>
        )}
        <input
          id="add-work-files"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
        <UploadFailureList failures={failures} onRetry={retryFailure} onDismiss={dismissFailure} />
        <div className="mt-4">
          <label htmlFor="add-work-size-weight" className="block text-sm text-text-muted mb-1">
            展示权重 {sizeWeight.toFixed(1)}（0.5=紧凑 1.0=默认 2.0=大）
          </label>
          <input
            id="add-work-size-weight"
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
            <SortableThumbGrid
              files={uploadedFiles.map((file) => ({
                key: file.imageUrl,
                imageUrl: file.imageUrl,
                thumbUrl: file.thumbUrl,
                mediaType: file.mediaType,
              }))}
              coverIndex={coverIndex}
              previewIndex={previewIndex}
              onPreview={setPreviewIndex}
              onCover={(index) => updateForm({ coverIndex: index })}
              onRemove={(index) => {
                void cleanupUploadedFiles([uploadedFiles[index]]);
                setFormState((current) => removeUploadedFile(current, index));
                setPreviewIndex((current) => getIndexAfterRemoval(current, index));
              }}
              onMove={(fromIndex, toIndex) => {
                setFormState((current) => moveUploadedFile(current, fromIndex, toIndex));
                setPreviewIndex((current) => getMovedIndex(current, fromIndex, toIndex));
              }}
            />
          </div>
        )}
      </div>

      <div>
        <label htmlFor="add-work-title" className="block text-sm text-text-muted mb-1">标题（批量上传时自动编号）</label>
        <input
          id="add-work-title"
          value={title}
          onChange={(event) => updateForm({ title: event.target.value })}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="作品名称"
        />
      </div>

      <div>
        <label htmlFor="add-work-description" className="block text-sm text-text-muted mb-1">简介</label>
        <textarea
          id="add-work-description"
          value={description}
          onChange={(event) => updateForm({ description: event.target.value })}
          rows={4}
          className="w-full bg-bg border border-border text-text px-4 py-3 text-sm focus:outline-none focus:border-accent-dim transition-colors resize-y"
          placeholder="作品描述"
        />
      </div>

      <div>
        <label htmlFor="add-work-tags" className="block text-sm text-text-muted mb-1">
          标签（逗号分隔，如：角色,场景,3D）
        </label>
        <input
          id="add-work-tags"
          value={tags}
          onChange={(event) => updateForm({ tags: event.target.value })}
          className="w-full bg-bg border border-border text-text px-4 py-2 text-sm focus:outline-none focus:border-accent-dim transition-colors"
          placeholder="标签"
        />
      </div>

      <div>
        <span className="block text-sm text-text-muted mb-2">使用软件（可多选）</span>
        <SoftwarePicker
          software={software}
          softwareCustom={softwareCustom}
          customInputId="add-work-software-custom"
          onChange={(patch) => updateForm(patch)}
        />
      </div>

      <div>
        <label htmlFor="add-work-date" className="block text-sm text-text-muted mb-1">
          时间（如：2024 年 3 月 / 2025 暑期）
        </label>
        <input
          id="add-work-date"
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
