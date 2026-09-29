"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useToasts, type ToastItem } from "@/lib/toast-store";

const ICONS: Record<ToastItem["type"], typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: CircleAlert,
};

const COLORS: Record<ToastItem["type"], string> = {
  info: "text-accent",
  success: "text-ok",
  error: "text-bad",
};

function Toast({ toast }: { toast: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  const Icon = ICONS[toast.type];
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-card border border-edge bg-card px-4 py-3 shadow-lg animate-rise-in"
    >
      <Icon size={16} className={`shrink-0 ${COLORS[toast.type]}`} />
      <span className="text-sm text-ink">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        className="ml-2 text-ink-muted transition-colors duration-150 hover:text-ink"
        aria-label="Fermer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-[100px] right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} />
        </div>
      ))}
    </div>
  );
}
