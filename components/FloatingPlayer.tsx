"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GripVertical,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { useJam } from "@/lib/jam-store";
import {
  useFloatingPlayer,
  type FloatingPosition,
} from "@/lib/floating-player-store";
import { useT } from "@/lib/i18n/locale-store";

const MARGIN = 8;
const BOTTOM_OFFSET = 190;
const SIDE_OFFSET = 16;
const FALLBACK_WIDTH = 280;
const FALLBACK_HEIGHT = 120;
const MIN_VIEWPORT_WIDTH = 768;

function clampPosition(
  x: number,
  y: number,
  w: number,
  h: number
): FloatingPosition {
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
  return {
    x: Math.min(Math.max(Math.round(x), MARGIN), maxX),
    y: Math.min(Math.max(Math.round(y), MARGIN), maxY),
  };
}

function autoPosition(w: number, h: number): FloatingPosition {
  return clampPosition(
    window.innerWidth - w - SIDE_OFFSET,
    window.innerHeight - h - BOTTOM_OFFSET,
    w,
    h
  );
}

export function FloatingPlayer() {
  const t = useT();
  const currentTrack = usePlayer((s) => s.currentTrack());
  const isPlaying = usePlayer((s) => s.isPlaying);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const jamRole = useJam((s) =>
    s.session ? (s.session.isHost ? "host" : "guest") : null
  );

  const visible = useFloatingPlayer((s) => s.visible);
  const storedPosition = useFloatingPlayer((s) => s.position);
  const hydrated = useFloatingPlayer((s) => s.hydrated);
  const hide = useFloatingPlayer((s) => s.hide);

  const [pos, setPos] = useState<FloatingPosition | null>(null);
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<FloatingPosition | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const locked = jamRole === "guest";

  // Load persisted visibility/position once (client-only, no SSR mismatch).
  useEffect(() => {
    useFloatingPlayer.getState().load();
  }, []);

  // Disabled on small viewports (mobile layout has its own condensed bar).
  useEffect(() => {
    const check = () => setIsSmallViewport(window.innerWidth < MIN_VIEWPORT_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el) return { w: FALLBACK_WIDTH, h: FALLBACK_HEIGHT };
    const rect = el.getBoundingClientRect();
    return {
      w: Math.max(Math.round(rect.width) || FALLBACK_WIDTH, 1),
      h: Math.max(Math.round(rect.height) || FALLBACK_HEIGHT, 1),
    };
  }, []);

  const applyPos = useCallback((next: FloatingPosition) => {
    posRef.current = next;
    setPos(next);
  }, []);

  // Initial placement once the persisted state is loaded.
  useEffect(() => {
    if (!hydrated || posRef.current) return;
    const { w, h } = measure();
    applyPos(storedPosition ?? autoPosition(w, h));
  }, [hydrated, storedPosition, measure, applyPos]);

  // Keep inside the viewport on resize. Auto-placed widgets follow the
  // bottom-right anchor; user-placed ones are only clamped.
  useEffect(() => {
    if (!hydrated) return;
    const onResize = () => {
      const { hasBeenDragged } = useFloatingPlayer.getState();
      const { w, h } = measure();
      if (!posRef.current) {
        applyPos(autoPosition(w, h));
      } else if (hasBeenDragged) {
        applyPos(clampPosition(posRef.current.x, posRef.current.y, w, h));
      } else {
        applyPos(autoPosition(w, h));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hydrated, measure, applyPos]);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !posRef.current) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { w, h } = measure();
    applyPos(
      clampPosition(
        drag.origX + e.clientX - drag.startX,
        drag.origY + e.clientY - drag.startY,
        w,
        h
      )
    );
  };

  const onDragEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (posRef.current) {
      useFloatingPlayer.getState().setPosition(posRef.current);
    }
  };

  if (!hydrated || !visible || !currentTrack || isSmallViewport || !pos) {
    return null;
  }

  const progress =
    durationMs > 0 ? Math.min((positionMs / durationMs) * 100, 100) : 0;

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={t.player.floatTitle}
      className="fixed z-[65] hidden w-[280px] rounded-card border border-edge bg-panel shadow-2xl md:block"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        title={t.player.floatDrag}
        className="flex cursor-grab items-center gap-2 px-2.5 pt-2.5 active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <GripVertical size={14} className="shrink-0 text-ink-muted" />
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-card border border-edge bg-card flex items-center justify-center">
          {currentTrack.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentTrack.coverUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <ListMusic size={16} className="text-ink-muted" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-white">
            {currentTrack.title}
          </span>
          <span className="truncate text-[12px] text-ink-muted">
            {currentTrack.artist}
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => hide()}
          title={t.player.floatHide}
          aria-label={t.player.floatHide}
          className="shrink-0 rounded-full p-1 text-ink-muted hover:text-white transition-colors"
        >
          <X size={15} />
        </button>
      </div>
      <div className="flex items-center justify-center gap-4 px-2.5 pt-1.5">
        <button
          onClick={() => void previous()}
          disabled={locked}
          title={t.player.previous}
          aria-label={t.player.previous}
          className="text-ink-soft hover:text-white transition-colors disabled:opacity-40"
        >
          <SkipBack size={17} />
        </button>
        <button
          onClick={() => void toggle()}
          title={isPlaying ? t.player.pause : t.player.play}
          aria-label={isPlaying ? t.player.pause : t.player.play}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent hover:bg-accent-hover text-white transition-colors shadow"
        >
          {isPlaying ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <button
          onClick={() => void next()}
          disabled={locked}
          title={t.player.next}
          aria-label={t.player.next}
          className="text-ink-soft hover:text-white transition-colors disabled:opacity-40"
        >
          <SkipForward size={17} />
        </button>
      </div>
      <div className="px-2.5 py-2">
        <div
          className="h-[3px] w-full overflow-hidden rounded-full bg-edge"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
