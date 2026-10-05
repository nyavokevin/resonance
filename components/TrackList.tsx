"use client";

import { useState } from "react";
import { ListMusic, MoreHorizontal, MoreVertical, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { toggleLike } from "@/lib/library";
import { shareTrackWithFriend } from "@/lib/dm";
import { useToasts } from "@/lib/toast-store";
import { PLATFORM_LABELS, type Track } from "@/lib/types";
import { TrackMenu, anchorFromEvent } from "@/components/TrackMenu";
import type { PopoverAnchor } from "@/components/Popover";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

export function formatDuration(ms?: number): string {
  if (!ms) return "--:--";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Cover({ track, className }: { track: Track; className: string }) {
  if (track.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={track.coverUrl} alt="" className={`${className} object-cover`} />
    );
  }
  return (
    <div className={`${className} flex items-center justify-center bg-hover`}>
      <ListMusic size={14} className="text-ink-muted" />
    </div>
  );
}

function useTrackMenu(tracks: Track[]) {
  const playTrack = usePlayer((s) => s.playTrack);
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  function openMenu(e: React.MouseEvent<HTMLElement>, track: Track) {
    e.stopPropagation();
    setMenuTrack(track);
    setMenuAnchor(anchorFromEvent(e));
  }

  function closeMenu() {
    setMenuAnchor(null);
    setMenuTrack(null);
  }

  function handleAddToQueue(track: Track) {
    void smartAddToQueue(track).then((result) => {
      usePlayer.getState().setQueueOpen(true);
      toastQueueResult(push, result, track.title);
    });
  }

  function menu(track: Track | null) {
    if (!track) return null;
    return (
      <TrackMenu
        track={track}
        anchor={menuAnchor}
        onClose={closeMenu}
        actions={{
          onPlay: () => {
            void playTrack(track, tracks).then(() => router.refresh());
          },
          playLabel: t.common.play,
          onPlayNext: () =>
            void smartPlayNext(track).then((result) =>
              toastQueueResult(push, result, track.title)
            ),
          onAddToQueue: () => handleAddToQueue(track),
          onLike: () =>
            void toggleLike(track).then((ok) =>
              push(
                ok === false
                  ? t.common.likeImpossible
                  : ok
                    ? t.common.likeAdded
                    : t.common.likeRemoved,
                ok === false ? "error" : "success"
              )
            ),
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
    );
  }

  return { openMenu, menu, menuTrack };
}

export function RecentGrid({ tracks }: { tracks: Track[] }) {
  const playTrack = usePlayer((s) => s.playTrack);
  const router = useRouter();
  const t = useT();
  const { openMenu, menu, menuTrack } = useTrackMenu(tracks);

  if (tracks.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted">
        {t.trackList.emptyHint}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {tracks.map((track) => (
        <div
          key={track.id}
          onClick={() => {
            void playTrack(track, tracks).then(() => router.refresh());
          }}
          className="group relative flex items-center justify-between p-2 rounded-card bg-card hover:bg-hover border border-edge transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Cover track={track} className="w-12 h-12 rounded-card shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-white text-[13px] font-semibold truncate group-hover:text-accent transition-colors">
                {track.title}
              </span>
              <span className="text-ink-muted text-[12px] truncate">
                {track.artist}
              </span>
            </div>
          </div>
          <button
            aria-label={fmt(t.search.playAria, { title: track.title })}
            className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow mr-1 shrink-0"
          >
            <Play size={16} fill="currentColor" />
          </button>
          <button
            aria-label={fmt(t.search.optionsAria, { title: track.title })}
            onClick={(e) => openMenu(e, track)}
            className="w-7 h-7 rounded-full text-ink-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-hover hover:text-white shrink-0"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      ))}
      {menu(menuTrack)}
    </div>
  );
}

export function TrendRows({ tracks }: { tracks: Track[] }) {
  const playTrack = usePlayer((s) => s.playTrack);
  const router = useRouter();
  const t = useT();
  const { openMenu, menu, menuTrack } = useTrackMenu(tracks);

  if (tracks.length === 0) return null;

  return (
    <div className="rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
      {tracks.map((track, i) => (
        <div
          key={track.id}
          onClick={() => {
            void playTrack(track, tracks).then(() => router.refresh());
          }}
          className="flex items-center justify-between px-3 py-2.5 hover:bg-hover transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-ink-muted text-[12px] font-mono w-5 text-center">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Cover track={track} className="w-9 h-9 rounded-[6px] shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-white text-[13px] font-semibold truncate group-hover:text-accent transition-colors">
                {track.title}
              </span>
              <span className="text-ink-muted text-[12px] truncate">
                {track.artist}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-ink-muted text-[12px] font-mono">
              {formatDuration(track.durationMs)}
            </span>
            <button
              aria-label={fmt(t.search.optionsAria, { title: track.title })}
              className="text-ink-muted hover:text-white p-1 transition-colors"
              onClick={(e) => openMenu(e, track)}
            >
              <MoreVertical size={15} />
            </button>
          </div>
        </div>
      ))}
      {menu(menuTrack)}
    </div>
  );
}

export function TrackRows({
  tracks,
  scrollable = false,
  maxHeightClassName = "max-h-[calc(100vh-340px)]",
}: {
  tracks: Track[];
  scrollable?: boolean;
  maxHeightClassName?: string;
}) {
  const playTrack = usePlayer((s) => s.playTrack);
  const currentTrack = usePlayer((s) => s.currentTrack());
  const t = useT();
  const { openMenu, menu, menuTrack } = useTrackMenu(tracks);

  return (
    <div
      className={`rounded-card bg-card border border-edge divide-y divide-edge ${
        scrollable
          ? `overflow-y-auto overflow-x-hidden min-h-[120px] ${maxHeightClassName}`
          : "overflow-hidden"
      }`}
    >
      {tracks.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-ink-muted">
          {t.trackList.noLiked}
        </p>
      ) : (
        tracks.map((track, i) => {
          const isCurrent = currentTrack?.id === track.id;
          return (
            <div
              key={track.id}
              onClick={() => void playTrack(track, tracks)}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-hover transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-ink-muted text-[12px] font-mono w-5 text-center">
                  {isCurrent ? (
                    <Play size={13} className="mx-auto text-accent" fill="currentColor" />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <Cover track={track} className="w-9 h-9 rounded-[6px] shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-[13px] font-semibold truncate transition-colors group-hover:text-accent ${
                      isCurrent ? "text-accent" : "text-white"
                    }`}
                  >
                    {track.title}
                  </span>
                  <span className="text-ink-muted text-[12px] truncate">
                    {track.artist}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-ink-muted text-[12px] font-mono">
                  {formatDuration(track.durationMs)}
                </span>
                <button
                  aria-label={fmt(t.search.optionsAria, { title: track.title })}
                  className="text-ink-muted hover:text-white p-1 transition-colors"
                  onClick={(e) => openMenu(e, track)}
                >
                  <MoreVertical size={15} />
                </button>
              </div>
            </div>
          );
        })
      )}
      {menu(menuTrack)}
    </div>
  );
}
