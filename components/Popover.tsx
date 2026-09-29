"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PopoverAnchor {
  x: number;
  y: number;
}

function anchorFromRect(rect: DOMRect): PopoverAnchor {
  return { x: rect.left, y: rect.bottom + 4 };
}

export { anchorFromRect };

export function Popover({
  anchor,
  onClose,
  children,
  minWidth = 200,
}: {
  anchor: PopoverAnchor | null;
  onClose: () => void;
  children: ReactNode;
  minWidth?: number;
}) {
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);

  if (!anchor || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[80]"
        onMouseDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <PopoverPanel anchor={anchor} minWidth={minWidth}>
        {children}
      </PopoverPanel>
    </>,
    document.body
  );
}

function PopoverPanel({
  anchor,
  minWidth,
  children,
}: {
  anchor: PopoverAnchor;
  minWidth: number;
  children: ReactNode;
}) {
  // Position computed on mount; flip if overflowing viewport.
  // Height unknown before render: estimate, menus are small.
  const style: { left: number; top?: number; bottom?: number; minWidth: number } = (() => {
    if (typeof window === "undefined") return { left: anchor.x, top: anchor.y, minWidth };
    const estWidth = Math.max(minWidth, 220);
    const estHeight = 320;
    const left = Math.max(8, Math.min(anchor.x, window.innerWidth - estWidth - 8));
    if (anchor.y + estHeight <= window.innerHeight - 8) {
      return { left, top: anchor.y, minWidth };
    }
    return { left, bottom: window.innerHeight - anchor.y + 4, minWidth };
  })();

  return (
    <div
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={style}
      className="fixed z-[81] overflow-hidden rounded-card border border-edge bg-card py-1 shadow-xl animate-rise-in"
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  danger,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors ${
        danger
          ? "text-bad hover:bg-bad/10"
          : "text-ink-soft hover:bg-hover hover:text-white"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );
}
