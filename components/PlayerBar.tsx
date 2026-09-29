"use client";

import {
  Heart,
  ListMusic,
  Mic,
  Maximize2,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  Check,
} from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { useRouter } from "next/navigation";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/lib/types";
import { Seekbar } from "@/components/PlayerControls";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { isLiked, toggleLike } from "@/lib/library";
import { useToasts } from "@/lib/toast-store";
import { useJam } from "@/lib/jam-store";
import { fetchJamState } from "@/lib/jam";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { TrackMenu, anchorFromEvent } from "@/components/TrackMenu";
import { Popover, MenuItem, MenuLabel, type PopoverAnchor } from "@/components/Popover";

export function PlayerBar() {
  const currentTrack = usePlayer((s) => s.currentTrack());
  const isPlaying = usePlayer((s) => s.isPlaying);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const repeat = usePlayer((s) => s.repeat);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const repeatCount = usePlayer((s) => s.repeatCount);
  const setRepeatTimes = usePlayer((s) => s.setRepeatTimes);
  const shuffle = usePlayer((s) => s.shuffle);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  const jamRole = useJam((s) => (s.session ? (s.session.isHost ? "host" : "guest") : null));
  const jamSession = useJam((s) => s.session);
  const jamMe = useJam((s) => s.me);
  const locked = jamRole === "guest";
  const jamDetached = usePlayer((s) => s.jamDetached);
  const jamSoft = usePlayer((s) => s.jamSoft);
  const jamHostPlaying = usePlayer((s) => s.jamHostPlaying);
  const queueEnded = usePlayer((s) => s.queueEnded);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [repeatMenuAnchor, setRepeatMenuAnchor] =
    useState<PopoverAnchor | null>(null);
  const [customRepeat, setCustomRepeat] = useState("");
  const [likedState, setLikedState] = useState<{ id: string; liked: boolean } | null>(
    null
  );

  const trackId = currentTrack?.id ?? null;

  useEffect(() => {
    if (!currentTrack) return;
    void isLiked(currentTrack).then((liked) =>
      setLikedState({ id: currentTrack.id, liked })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  const liked = likedState?.id === trackId ? likedState.liked : false;

  async function handleLike() {
    if (!currentTrack) return;
    const next = await toggleLike(currentTrack);
    if (next === null) {
      push("Impossible d'aimer ce morceau", "error");
      return;
    }
    setLikedState({ id: currentTrack.id, liked: next });
    push(next ? "Ajouté aux titres aimés" : "Retiré des titres aimés", "success");
    router.refresh();
  }

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="fixed bottom-0 left-0 right-0 lg:left-[220px] h-[90px] bg-panel border-t border-edge z-50 px-3 md:px-5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 flex-1 min-w-0 sm:w-[260px] sm:min-w-[200px] sm:flex-none">
        <div
          className={`relative w-12 h-12 rounded-card bg-card border border-edge overflow-hidden shrink-0 flex items-center justify-center ${
            isPlaying && !queueEnded ? "animate-pulse-soft" : ""
          } ${queueEnded ? "grayscale opacity-50" : ""}`}
        >
          {currentTrack?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentTrack.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ListMusic size={18} className="text-ink-muted" />
          )}
        </div>
        <div className="flex flex-col min-w-0 pr-1">
          <span className="text-white text-[13px] font-semibold truncate hover:underline cursor-pointer">
            {currentTrack?.title ?? "Aucun morceau"}
          </span>
          <span className="text-ink-muted text-[12px] truncate hover:underline cursor-pointer">
            {currentTrack?.artist ?? "—"}
          </span>
          {jamSession && (
            <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-semibold uppercase text-accent truncate">
                Jam {jamSession.code}
                {jamMe ? ` • ${jamMe.name}` : ""}
              </span>
            </span>
          )}
        </div>
        <button
          onClick={() => void handleLike()}
          title="Favori"
          className={`p-1 transition-transform ml-auto hover:scale-105 ${
            liked ? "text-accent" : "text-ink-muted hover:text-white"
          }`}
          disabled={!currentTrack}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex-1 max-w-xl flex flex-col items-center gap-1 px-1 sm:px-4 min-w-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={toggleShuffle}
            disabled={locked}
            title="Lecture aléatoire"
            aria-label="Lecture aléatoire"
            className={`hidden sm:block transition-colors ${
              shuffle ? "text-accent" : "text-ink-muted hover:text-white"
            } disabled:opacity-40 disabled:hover:text-ink-muted`}
          >
            <Shuffle size={17} />
          </button>
          <button
            onClick={() => void previous()}
            disabled={locked}
            title="Précédent"
            aria-label="Précédent"
            className="text-ink-soft hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-ink-soft"
          >
            <SkipBack size={19} />
          </button>
          <button
            onClick={() => {
              void toggle();
            }}
            disabled={false}
            title={
              jamRole === "guest"
                ? "Pause/lecture locale (Go Live pour se recaler)"
                : isPlaying
                  ? "Pause"
                  : "Lecture"
            }
            aria-label={isPlaying ? "Pause" : "Lecture"}
            className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors shadow"
          >
            {isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => void next()}
            disabled={locked}
            title="Suivant"
            aria-label="Suivant"
            className="text-ink-soft hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-ink-soft"
          >
            <SkipForward size={19} />
          </button>
          <button
            onClick={cycleRepeat}
            onContextMenu={(e) => {
              if (locked) return;
              e.preventDefault();
              setCustomRepeat("");
              setRepeatMenuAnchor({ x: e.clientX, y: e.clientY });
            }}
            disabled={locked}
            title="Répéter (clic droit : répéter ×N)"
            aria-label="Répéter"
            aria-haspopup="menu"
            className={`relative hidden sm:block transition-colors ${
              repeat !== "off" ? "text-accent" : "text-ink-muted hover:text-white"
            } disabled:opacity-40 disabled:hover:text-ink-muted`}
          >
            {repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
            {repeat === "times" && (
              <span className="absolute -bottom-1 -right-2 rounded bg-accent px-1 text-[9px] font-bold leading-[1.2] text-white">
                ×{repeatCount}
              </span>
            )}
          </button>
          <Popover
            anchor={repeatMenuAnchor}
            onClose={() => setRepeatMenuAnchor(null)}
          >
            <MenuLabel>Répéter le titre</MenuLabel>
            {[2, 3, 5, 10].map((n) => (
              <MenuItem
                key={n}
                icon={
                  repeat === "times" && repeatCount === n ? (
                    <Check size={14} className="text-accent" />
                  ) : (
                    <span className="w-[14px]" />
                  )
                }
                onClick={() => {
                  setRepeatTimes(n);
                  setRepeatMenuAnchor(null);
                }}
              >
                Répéter ×{n}
              </MenuItem>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = Math.max(1, Math.min(99, Math.floor(Number(customRepeat))));
                if (!Number.isFinite(n) || n < 1) return;
                setRepeatTimes(n);
                setRepeatMenuAnchor(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 border-t border-edge mt-1 pt-2.5"
            >
              <input
                value={customRepeat}
                onChange={(e) => setCustomRepeat(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="1-99"
                inputMode="numeric"
                aria-label="Nombre de répétitions personnalisé"
                className="w-14 rounded-card border border-edge bg-base px-2 py-1 text-[12px] text-white placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={!customRepeat}
                className="rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-medium px-2.5 py-1 transition-colors disabled:opacity-60"
              >
                OK
              </button>
            </form>
          </Popover>
        </div>
        <div className="w-full">
          <Seekbar />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 sm:gap-2.5 flex-none">
        {(jamRole === "guest" &&
          jamSession &&
          (jamDetached || jamSoft || (jamHostPlaying && !isPlaying))) && (
          <button
            onClick={() => {
              void fetchJamState(jamSession.id).then((state) => {
                if (state) void usePlayer.getState().rejoinJam(state);
                push("Re-synchronisé avec le live", "success");
              });
            }}
            title="Revenir en direct sur la position du host"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent hover:bg-accent-hover text-white text-[10px] font-bold uppercase tracking-wider animate-pulse transition-colors"
          >
            <Zap size={12} fill="currentColor" />
            Go Live
          </button>
        )}
        {currentTrack && (
          <div className="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded bg-card border border-edge">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: PLATFORM_COLORS[currentTrack.platform] }}
            />
            <span className="text-[10px] font-semibold uppercase text-ink-soft">
              {PLATFORM_LABELS[currentTrack.platform]}
            </span>
          </div>
        )}
        <button
          onClick={() => push("Paroles — bientôt disponible", "info")}
          title="Paroles"
          className="hidden md:block text-ink-muted hover:text-white p-1 transition-colors"
        >
          <Mic size={17} />
        </button>
        {currentTrack && (
          <button
            onClick={(e) => setMenuAnchor(anchorFromEvent(e))}
            title="Plus d'actions"
            aria-label="Plus d'actions"
            className="text-ink-muted hover:text-white p-1 transition-colors"
          >
            <MoreHorizontal size={17} />
          </button>
        )}
        <button
          onClick={() => setQueueOpen(!queueOpen)}
          title={"File d'attente"}
          className={`p-1 transition-colors ${
            queueOpen ? "text-accent" : "text-ink-muted hover:text-white"
          }`}
        >
          <ListMusic size={17} />
        </button>
        <div className="hidden md:flex items-center gap-1.5 pl-1">
          <button
            onClick={toggleMute}
            title="Volume"
            className="text-ink-muted hover:text-white transition-colors"
          >
            <VolumeIcon size={17} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
            style={{
              width: 64,
              background: `linear-gradient(to right, var(--color-ink-soft) ${
                (muted ? 0 : volume) * 100
              }%, var(--color-edge) ${(muted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>
        <button
          onClick={() => push("Plein écran — bientôt disponible", "info")}
          title="Plein écran"
          className="hidden md:block text-ink-muted hover:text-white p-1 transition-colors"
        >
          <Maximize2 size={17} />
        </button>
      </div>
      {currentTrack && (
        <TrackMenu
          track={currentTrack}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          actions={{
            onPlayNext: () =>
              void smartPlayNext(currentTrack).then((result) =>
                toastQueueResult(push, result, currentTrack.title)
              ),
            onAddToQueue: () =>
              void smartAddToQueue(currentTrack).then((result) => {
                usePlayer.getState().setQueueOpen(true);
                toastQueueResult(push, result, currentTrack.title);
              }),
            onLike: () => void handleLike(),
          }}
        />
      )}
    </footer>
  );
}
