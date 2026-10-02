"use client";

import type { CSSProperties } from "react";
import {
  ListMusic,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n/locale-store";

const DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface MiniPlayerWindowProps {
  snap: MiniSnapshot | null;
}

export function MiniPlayerWindow({ snap }: MiniPlayerWindowProps) {
  const t = useT();
  const track = snap?.track ?? null;
  const isPlaying = snap?.isPlaying ?? false;
  const positionMs = snap?.positionMs ?? 0;
  const durationMs = snap?.durationMs ?? 0;
  const progress =
    durationMs > 0 ? Math.min((positionMs / durationMs) * 100, 100) : 0;

  const send = (cmd: MiniCommand) => window.resonance?.sendMiniCommand(cmd);
  const backToApp = () => window.resonance?.expandMainWindow();

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    send({ type: "seek", value: Math.round(ratio * durationMs) });
  };

  return (
    <div className="flex h-screen w-screen select-none flex-col overflow-hidden rounded-card border border-edge bg-panel">
      <div
        className="flex cursor-default items-center gap-2 px-2.5 pt-2.5"
        style={DRAG_STYLE}
        title={t.player.floatDrag}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-card border border-edge bg-card">
          {track?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.coverUrl}
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
            {track?.title ?? t.player.noTrack}
          </span>
          <span className="truncate text-[12px] text-ink-muted">
            {track ? `${track.artist} · ${formatTime(positionMs)}` : "—"}
          </span>
        </div>
        <button
          onClick={backToApp}
          title={t.player.miniBack}
          aria-label={t.player.miniBack}
          style={NO_DRAG_STYLE}
          className="shrink-0 rounded-full p-1 text-ink-muted hover:text-white transition-colors"
        >
          <Maximize2 size={15} />
        </button>
        <button
          onClick={backToApp}
          title={t.player.floatHide}
          aria-label={t.player.floatHide}
          style={NO_DRAG_STYLE}
          className="shrink-0 rounded-full p-1 text-ink-muted hover:text-white transition-colors"
        >
          <X size={15} />
        </button>
      </div>
      <div
        className="flex items-center justify-center gap-4 px-2.5 pt-1.5"
        style={NO_DRAG_STYLE}
      >
        <button
          onClick={() => send({ type: "previous" })}
          disabled={!track}
          title={t.player.previous}
          aria-label={t.player.previous}
          className="text-ink-soft hover:text-white transition-colors disabled:opacity-40"
        >
          <SkipBack size={17} />
        </button>
        <button
          onClick={() => send({ type: "toggle" })}
          disabled={!track}
          title={isPlaying ? t.player.pause : t.player.play}
          aria-label={isPlaying ? t.player.pause : t.player.play}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent hover:bg-accent-hover text-white transition-colors shadow disabled:opacity-40"
        >
          {isPlaying ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <button
          onClick={() => send({ type: "next" })}
          disabled={!track}
          title={t.player.next}
          aria-label={t.player.next}
          className="text-ink-soft hover:text-white transition-colors disabled:opacity-40"
        >
          <SkipForward size={17} />
        </button>
      </div>
      <div className="px-2.5 py-2" style={NO_DRAG_STYLE}>
        <div
          className="h-[12px] flex items-center cursor-pointer"
          onClick={onSeek}
          title={t.player.seekAria}
        >
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
