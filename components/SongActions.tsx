"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ListPlus, MoreHorizontal, Play } from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { shareTrackWithFriend } from "@/lib/dm";
import { useToasts } from "@/lib/toast-store";
import { isLiked, toggleLike } from "@/lib/library";
import type { Track } from "@/lib/types";
import { TrackMenu, anchorFromEvent } from "@/components/TrackMenu";
import type { PopoverAnchor } from "@/components/Popover";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

export function SongActions({ track }: { track: Track }) {
  const playTrack = usePlayer((s) => s.playTrack);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const t = useT();

  useEffect(() => {
    void isLiked(track).then(setLiked);
  }, [track]);

  async function handleLike() {
    const next = await toggleLike(track);
    if (next === null) {
      push(t.common.likeTrackImpossible, "error");
      return;
    }
    setLiked(next);
    push(next ? t.common.likeAddedShort : t.common.likeRemoved, "success");
    router.refresh();
  }

  function handlePlay() {
    void playTrack(track, [track]).then(() => router.refresh());
    push(fmt(t.search.playTitle, { title: track.title }), "success");
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
        aria-label={t.trackMenu.likeTrack}
      >
        <Heart size={18} fill={liked ? "currentColor" : "none"} />
      </button>
      <button
        onClick={handleAdd}
        className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors"
      >
        <ListPlus size={15} />
        <span>{t.trackMenu.addToQueue}</span>
      </button>
      <button
        onClick={handlePlay}
        className="px-5 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
      >
        <Play size={16} fill="currentColor" />
        <span>{t.common.listen}</span>
      </button>
      <button
        onClick={(e) => setMenuAnchor(anchorFromEvent(e))}
        aria-label={t.player.moreActions}
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
          playLabel: t.common.listen,
          onPlayNext: () =>
            void smartPlayNext(track).then((result) =>
              toastQueueResult(push, result, track.title)
            ),
          onLike: handleLike,
          onShareToFriend: async (friendId) => {
            const convId = await shareTrackWithFriend(track, friendId);
            push(
              convId ? t.chat.trackShared : t.common.operationImpossible,
              convId ? "success" : "error"
            );
            return convId;
          },
        }}
      />
    </div>
  );
}
