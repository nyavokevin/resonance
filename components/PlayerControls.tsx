"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePlayer } from "@/lib/player/engine";
import { useJam } from "@/lib/jam-store";
import { useToasts } from "@/lib/toast-store";

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Seekbar() {
  const { positionMs, durationMs, limited } = usePlayer();
  const seek = usePlayer((s) => s.seek);
  const jamRole = useJam((s) => (s.session ? (s.session.isHost ? "host" : "guest") : null));
  const [preview, setPreview] = useState<number | null>(null);

  const max = durationMs > 0 ? durationMs : 1;
  const shown = preview ?? positionMs;
  const locked = limited || jamRole === "guest";

  return (
    <div className="group flex w-full items-center gap-2">
      <span className="text-ink-muted text-[11px] font-mono w-8 text-right">
        {formatTime(shown)}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={500}
        value={shown}
        disabled={locked}
        aria-label="Position de lecture"
        onChange={(e) => setPreview(Number(e.target.value))}
        onPointerUp={() => {
          if (preview !== null) seek(preview);
          setPreview(null);
        }}
        onKeyUp={() => {
          if (preview !== null) seek(preview);
          setPreview(null);
        }}
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${(
            (shown / max) *
            100
          ).toFixed(1)}%, var(--color-edge) ${((shown / max) * 100).toFixed(1)}%)`,
        }}
        className="w-full"
      />
      <span className="text-ink-muted text-[11px] font-mono w-8">
        {durationMs > 0 ? formatTime(durationMs) : "--:--"}
      </span>
      {limited && <span className="sr-only">Contrôles limités sur cette plateforme</span>}
    </div>
  );
}

export function KeyboardShortcuts({ children }: { children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

      const player = usePlayer.getState();
      const push = useToasts.getState().push;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          void player.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          player.seek(Math.min(player.positionMs + 5000, player.durationMs));
          break;
        case "ArrowLeft":
          e.preventDefault();
          player.seek(Math.max(player.positionMs - 5000, 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          player.setVolume(Math.min(player.volume + 0.05, 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          player.setVolume(Math.max(player.volume - 0.05, 0));
          break;
        case "KeyM":
          player.toggleMute();
          push(player.muted ? "Son activé" : "Son coupé", "info");
          break;
        case "KeyQ":
          player.setQueueOpen(!player.queueOpen);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <>{children}</>;
}
