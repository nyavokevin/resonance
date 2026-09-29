"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ListPlus, MoreHorizontal, Play } from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import { isLiked, toggleLike } from "@/lib/library";
import type { Track } from "@/lib/types";
import { TrackMenu, anchorFromEvent } from "@/components/TrackMenu";
import type { PopoverAnchor } from "@/components/Popover";

export function SongActions({ track }: { track: Track }) {
  const playTrack = usePlayer((s) => s.playTrack);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  useEffect(() => {
    void isLiked(track).then(setLiked);
  }, [track]);

  async function handleLike() {
    const next = await toggleLike(track);
    if (next === null) {
      push("Impossible d'aimer ce morceau", "error");
      return;
    }
    setLiked(next);
    push(next ? "Ajouté aux titres aimés" : "Retiré des titres aimés", "success");
    router.refresh();
  }

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
    <div className="flex items-center gap-2.5">
      <button
        onClick={handleLike}
        className={`w-10 h-10 rounded-full border border-edge bg-panel hover:bg-hover flex items-center justify-center transition-colors ${
          liked ? "text-accent" : "text-ink-soft"
        }`}
        aria-label="Aimer"
      >
        <Heart size={18} fill={liked ? "currentColor" : "none"} />
      </button>
      <button
        onClick={handleAdd}
        className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors"
      >
        <ListPlus size={15} />
        <span>Ajouter à la file</span>
      </button>
      <button
        onClick={handlePlay}
        className="px-5 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
      >
        <Play size={16} fill="currentColor" />
        <span>Écouter</span>
      </button>
      <button
        onClick={(e) => setMenuAnchor(anchorFromEvent(e))}
        aria-label="Plus d'actions"
        className="w-10 h-10 rounded-full border border-edge bg-panel hover:bg-hover text-ink-soft hover:text-white flex items-center justify-center transition-colors"
      >
        <MoreHorizontal size={18} />
      </button>
      <TrackMenu
        track={track}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        actions={{
          onPlay: handlePlay,
          playLabel: "Écouter",
          onPlayNext: () =>
            void smartPlayNext(track).then((result) =>
              toastQueueResult(push, result, track.title)
            ),
          onLike: handleLike,
        }}
      />
    </div>
  );
}
