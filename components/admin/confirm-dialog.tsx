"use client";

export default function ConfirmDialog({
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
