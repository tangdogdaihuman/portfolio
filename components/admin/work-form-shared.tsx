"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { uploadImageToR2, type UploadedFile } from "@/lib/upload-client";
import { SOFTWARE_PRESETS } from "@/components/admin/work-form-state";

export interface UploadFailure {
  name: string;
  reason: string;
  file: File;
}

const UPLOAD_CONCURRENCY = 3;

export function useMultiFileUpload({ onUploaded }: { onUploaded: (files: UploadedFile[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [doneBytes, setDoneBytes] = useState(0);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const runningBatchesRef = useRef(0);

  const runBatch = useCallback(async (batch: File[]) => {
    if (batch.length === 0) return;
    if (runningBatchesRef.current === 0) {
      setTotalCount(0);
      setDoneCount(0);
      setTotalBytes(0);
      setDoneBytes(0);
    }
    runningBatchesRef.current += 1;
    setUploading(true);
    setTotalCount((count) => count + batch.length);
    setTotalBytes((bytes) => bytes + batch.reduce((sum, file) => sum + file.size, 0));

    const results: (UploadedFile | null)[] = new Array(batch.length).fill(null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < batch.length) {
        const index = cursor;
        cursor += 1;
        const file = batch[index];
        try {
          results[index] = await uploadImageToR2(file);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "上传失败";
          setFailures((current) => [...current, { name: file.name, reason, file }]);
        } finally {
          setDoneCount((count) => count + 1);
          setDoneBytes((bytes) => bytes + file.size);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, batch.length) }, () => worker()));
    } finally {
      runningBatchesRef.current -= 1;
      if (runningBatchesRef.current === 0) setUploading(false);
    }

    const succeeded = results.filter((file): file is UploadedFile => file !== null);
    if (succeeded.length > 0) onUploaded(succeeded);
  }, [onUploaded]);

  const startUpload = useCallback((files: File[]) => {
    void runBatch(files);
  }, [runBatch]);

  const retryFailure = useCallback((name: string) => {
    setFailures((current) => {
      const target = current.find((failure) => failure.name === name);
      if (target) void runBatch([target.file]);
      return current.filter((failure) => failure.name !== name);
    });
  }, [runBatch]);

  const dismissFailure = useCallback((name: string) => {
    setFailures((current) => current.filter((failure) => failure.name !== name));
  }, []);

  return { uploading, totalCount, doneCount, totalBytes, doneBytes, failures, startUpload, retryFailure, dismissFailure };
}

export function UploadProgressBar({
  label,
  doneCount,
  totalCount,
  doneBytes,
  totalBytes,
}: {
  label: string;
  doneCount: number;
  totalCount: number;
  doneBytes: number;
  totalBytes: number;
}) {
  const percent = totalBytes > 0
    ? Math.min(100, (doneBytes / totalBytes) * 100)
    : totalCount > 0
      ? (doneCount / totalCount) * 100
      : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{label}</span>
        <span>{doneCount} / {totalCount}</span>
      </div>
      <div className="glass-chip h-2 overflow-hidden rounded-full">
        <div className="h-full rounded-full bg-accent transition-all duration-300 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function UploadFailureList({
  failures,
  onRetry,
  onDismiss,
}: {
  failures: UploadFailure[];
  onRetry: (name: string) => void;
  onDismiss: (name: string) => void;
}) {
  if (failures.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2 text-xs">
      {failures.map((failure) => (
        <li key={failure.name} className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2.5">
          <span className="flex-1 truncate text-text-muted">{failure.name}：{failure.reason}</span>
          <button type="button" onClick={() => onRetry(failure.name)} className="text-accent hover:underline">
            重试
          </button>
          <button
            type="button"
            onClick={() => onDismiss(failure.name)}
            className="text-text-muted hover:text-text"
            aria-label={`移除 ${failure.name} 的失败记录`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SoftwarePicker({
  software,
  softwareCustom,
  customInputId,
  onChange,
}: {
  software: string[];
  softwareCustom: string;
  customInputId: string;
  onChange: (patch: { software?: string[]; softwareCustom?: string }) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {SOFTWARE_PRESETS.map((name) => {
          const checked = software.includes(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={checked}
              onClick={() => {
                onChange({ software: checked ? software.filter((item) => item !== name) : [...software, name] });
              }}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                checked
                  ? "border-accent/50 bg-accent/12 text-accent"
                  : "border-border/60 text-text-muted hover:text-text"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <input
        id={customInputId}
        value={softwareCustom}
        onChange={(event) => onChange({ softwareCustom: event.target.value })}
        className="glass-chip mt-2 w-full rounded-2xl px-4 py-3 text-sm text-text transition-colors placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none"
        placeholder="自定义软件（逗号分隔）"
      />
    </div>
  );
}

export interface ThumbFile {
  key: string;
  imageUrl: string;
  thumbUrl: string;
  mediaType: string;
}

export function SortableThumbGrid({
  files,
  coverIndex,
  previewIndex,
  onPreview,
  onCover,
  onRemove,
  onMove,
}: {
  files: ThumbFile[];
  coverIndex: number;
  previewIndex: number;
  onPreview: (index: number) => void;
  onCover: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}) {
  const dragIdxRef = useRef<number | null>(null);
  const activePreviewIndex = files.length === 0 ? 0 : Math.min(previewIndex, files.length - 1);
  const previewFile = files[activePreviewIndex] || files[0];

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <div
            key={file.key}
            draggable
            onDragStart={() => { dragIdxRef.current = index; }}
            onDragOver={(event) => event.preventDefault()}
            onDragEnd={() => { dragIdxRef.current = null; }}
            onDrop={() => {
              const fromIdx = dragIdxRef.current;
              if (fromIdx === null || fromIdx === index) return;
              onMove(fromIdx, index);
              dragIdxRef.current = null;
            }}
            onClick={() => onPreview(index)}
            className={`relative w-20 h-16 cursor-grab active:cursor-grabbing group overflow-hidden rounded-xl border ${
              index === activePreviewIndex ? "border-accent" : "border-border/60"
            }`}
          >
            {file.mediaType === "video" ? (
              <video src={file.imageUrl} muted preload="metadata" className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <Image src={file.thumbUrl} alt="" fill sizes="80px" unoptimized className="object-cover" />
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCover(index);
              }}
              className={`absolute bottom-1 left-1 rounded-full border px-1.5 py-0.5 text-[9px] ${
                index === coverIndex
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border/70 bg-bg/70 text-text-muted backdrop-blur-sm hover:text-text"
              }`}
            >
              封面
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(index);
              }}
              className="glass-chip absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs text-text-muted transition-colors hover:text-red-400"
              aria-label={`删除第 ${index + 1} 张`}
            >
              ×
            </button>
          </div>
        ))}
        {files.length === 0 && <p className="text-text-muted text-xs">暂无图片</p>}
      </div>
      {files.length > 0 && (
        <div className="glass hidden md:block rounded-[24px] p-3">
          <p className="meta-label mb-2">原图预览</p>
          {previewFile?.mediaType === "video" ? (
            <video
              src={previewFile.imageUrl}
              controls
              className="w-full h-auto max-h-[18rem] rounded-2xl border border-border/40 bg-bg/70 object-contain"
            />
          ) : (
            <Image
              src={previewFile.imageUrl}
              alt="原图预览"
              width={840}
              height={840}
              unoptimized
              className="w-full h-auto max-h-[18rem] rounded-2xl border border-border/40 bg-bg/70 object-contain"
            />
          )}
        </div>
      )}
    </div>
  );
}
