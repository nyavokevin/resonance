"use client";

import { CheckCircle2, Link2, Play, ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, toastQueueResult } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import { PLATFORM_LABELS, type Track } from "@/lib/types";
import { formatDuration } from "@/components/TrackList";

export function LastPlayedBanner({ track }: { track: Track }) {
  const playTrack = usePlayer((s) => s.playTrack);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const push = useToasts((s) => s.push);
  const router = useRouter();

  function handlePlay() {
    void playTrack(track, [track]).then(() => router.refresh());
    push(`Lecture : ${track.title}`, "success");
  }

  function handleAdd() {
    void smartAddToQueue(track).then((result) => {
      setQueueOpen(true);
      toastQueueResult(push, result, track.title);
    });
  }

  return (
    <section className="rounded-card bg-card border border-edge p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1.5 max-w-xl">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-[6px] bg-panel border border-edge text-ok text-[11px] font-semibold tracking-wide flex items-center gap-1">
            <CheckCircle2 size={13} />
            Dernière écoute
          </span>
          <span className="text-ink-muted text-[11px]">
            {PLATFORM_LABELS[track.platform]}
          </span>
        </div>
        <h2 className="font-display text-[16px] text-white font-semibold">
          {track.title}
        </h2>
        <div className="flex items-center gap-2 text-ink-muted text-[12px] bg-base border border-edge px-2.5 py-1 rounded-card max-w-md">
          <Link2 size={14} className="text-accent" />
          <span className="truncate">{track.artist}</span>
          <span className="text-ok ml-auto font-medium text-[11px]">
            {formatDuration(track.durationMs)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={handleAdd}
          className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors"
        >
          <ListPlus size={15} />
          <span>Ajouter</span>
        </button>
        <button
          onClick={handlePlay}
          className="px-4 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Play size={15} fill="currentColor" />
          <span>Écouter</span>
        </button>
      </div>
    </section>
  );
}
