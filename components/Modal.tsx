"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/locale-store";

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const resolvedConfirm = confirmLabel ?? t.common.delete;
  const resolvedCancel = cancelLabel ?? t.common.cancel;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-card border border-edge bg-panel p-5 shadow-2xl animate-rise-in"
      >
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        <p className="mt-1.5 text-[13px] text-ink-soft">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-2 rounded-card border border-edge bg-card text-white text-[12px] font-medium hover:bg-hover transition-colors disabled:opacity-60"
          >
            {resolvedCancel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-3.5 py-2 rounded-card bg-bad text-white text-[12px] font-semibold hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? "..." : resolvedConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
