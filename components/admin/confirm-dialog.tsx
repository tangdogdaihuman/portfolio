"use client";

import { useEffect, useRef } from "react";

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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        const focusables = [cancelRef.current, confirmRef.current].filter((el): el is HTMLButtonElement => el !== null);
        if (focusables.length === 0) return;
        const active = document.activeElement;
        const index = focusables.indexOf(active as HTMLButtonElement);
        event.preventDefault();
        const next = event.shiftKey
          ? focusables[(index - 1 + focusables.length) % focusables.length]
          : focusables[(index + 1) % focusables.length];
        (next ?? focusables[0]).focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => cancelRef.current?.focus());

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm border border-border bg-surface p-5 shadow-2xl">
        <h2 className="font-display text-xl text-text">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} onClick={onCancel} className="border border-border px-4 py-2 text-sm text-text-muted hover:text-text">
            取消
          </button>
          <button ref={confirmRef} onClick={onConfirm} className="bg-red-400 px-4 py-2 text-sm font-medium text-bg hover:bg-red-300">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
