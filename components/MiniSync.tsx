"use client";

import { useEffect } from "react";
import { usePlayer } from "@/lib/player/engine";

function snapshot(): MiniSnapshot {
  const s = usePlayer.getState();
  const track = s.currentTrack();
  return {
    track: track
      ? {
          id: track.id,
          title: track.title,
          artist: track.artist,
          coverUrl: track.coverUrl ?? null,
        }
      : null,
    isPlaying: s.isPlaying,
    positionMs: Math.round(s.positionMs),
    durationMs: s.durationMs,
  };
}

/**
 * Runs in the MAIN window only (Shell is not rendered on /mini).
 * Pushes player snapshots to the floating mini window and applies
 * the transport commands coming back from it. Playback (audio/adapters)
 * stays here — the mini window is a remote control.
 */
export function MiniSync() {
  useEffect(() => {
    if (!window.resonance?.isElectron) return;

    const push = () => window.resonance?.sendMiniState(snapshot());
    push();

    // Position ticks every 500ms — only forward actual changes.
    let last = JSON.stringify(snapshot());
    const unsub = usePlayer.subscribe(() => {
      const snap = snapshot();
      const key = JSON.stringify(snap);
      if (key !== last) {
        last = key;
        window.resonance?.sendMiniState(snap);
      }
    });

    const off = window.resonance.onMiniCommand((cmd) => {
      const p = usePlayer.getState();
      if (cmd.type === "toggle") void p.toggle();
      else if (cmd.type === "next") void p.next();
      else if (cmd.type === "previous") void p.previous();
      else if (cmd.type === "seek") p.seek(cmd.value);
      else if (cmd.type === "sync") push();
    });

    return () => {
      unsub();
      off();
    };
  }, []);

  return null;
}
