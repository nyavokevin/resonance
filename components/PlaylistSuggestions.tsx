"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListMusic, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, toastQueueResult } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import { PLATFORM_LABELS, type Track } from "@/lib/types";
import { addTrackToPlaylist, addTracksToPlaylist } from "@/lib/playlists";
import { formatDuration } from "@/components/TrackList";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

interface YtResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail?: string;
  durationMs?: number;
}

function ytToTrack(r: YtResult): Track {
  return {
    id: `youtube:track:${r.videoId}`,
    platform: "youtube",
    platformTrackId: r.videoId,
    title: r.title,
    artist: r.channel,
    coverUrl: r.thumbnail,
    sourceUrl: `https://www.youtube.com/watch?v=${r.videoId}`,
    durationMs: r.durationMs,
    auto: true,
  };
}

/** 3 seeds répartis (début / milieu / fin) pour couvrir toute la playlist. */
function pickSeeds(tracks: Track[], round: number): Track[] {
  if (tracks.length === 0) return [];
  if (tracks.length <= 3) {
    const rotated = [...tracks];
    const shift = round % Math.max(rotated.length, 1);
    return [...rotated.slice(shift), ...rotated.slice(0, shift)].slice(0, 3);
  }
  const idx = [
    Math.floor(tracks.length * 0.15),
    Math.floor(tracks.length * 0.5),
    Math.floor(tracks.length * 0.85),
  ];
  const offset = round % tracks.length;
  return idx.map((i) => tracks[(i + offset) % tracks.length]);
}

async function fetchForSeed(
  seed: Track,
  excludeParam: string,
  signal: AbortSignal
): Promise<Track[]> {
  // 1) Graine YouTube → radio "Up next" directe.
  if (
    (seed.platform === "youtube" || seed.platform === "youtube-music") &&
    seed.platformTrackId
  ) {
    try {
      const res = await fetch(
        `/api/radio?videoId=${encodeURIComponent(seed.platformTrackId)}&exclude=${encodeURIComponent(excludeParam)}`,
        { signal }
      );
      if (res.ok) {
        const data = await res.json();
        const list = (data.tracks ?? []) as Track[];
        if (list.length > 0) return list;
      }
    } catch {
      if (signal.aborted) return [];
      // Repli recherche ci-dessous.
    }
  }
  // 2) Repli : recherche YouTube "titre artiste" (jouable directement).
  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(`${seed.title} ${seed.artist}`)}&source=youtube`,
      { signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const yt = (data.results ?? []) as YtResult[];
    return yt.slice(0, 6).map(ytToTrack);
  } catch {
    return [];
  }
}

/**
 * Suggestions automatiques en bas des détails playlist.
 * Ne rend rien tant qu'aucune suggestion n'est disponible.
 * L'ajout (unité / tout) écrit dans la playlist courante (owner uniquement).
 */
export function PlaylistSuggestions({
  playlistId,
  playlistTracks,
  isOwner,
}: {
  playlistId: string;
  playlistTracks: Track[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const playTrack = usePlayer((s) => s.playTrack);

  const [suggestions, setSuggestions] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);

  const excludeKey = useMemo(
    () => playlistTracks.map((t) => t.id).join(","),
    [playlistTracks]
  );

  const load = useCallback(
    async (seedRound: number, signal: AbortSignal) => {
      if (playlistTracks.length === 0) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      try {
        const seeds = pickSeeds(playlistTracks, seedRound);
        const excludeIds = new Set(playlistTracks.map((t) => t.id));
        const excludeParam = [...excludeIds].join(",");
        const batches = await Promise.all(
          seeds.map((s) => fetchForSeed(s, excludeParam, signal))
        );
        if (signal.aborted) return;
        const seen = new Set(playlistTracks.map((t) => t.id));
        const merged: Track[] = [];
        // Entrelacement : 1er de chaque seed, puis 2e… (diversité).
        const maxLen = Math.max(...batches.map((b) => b.length), 0);
        for (let i = 0; i < maxLen && merged.length < 10; i++) {
          for (const batch of batches) {
            const t = batch[i];
            if (!t || seen.has(t.id)) continue;
            seen.add(t.id);
            merged.push(t);
            if (merged.length >= 10) break;
          }
        }
        setSuggestions(merged);
      } catch {
        if (!signal.aborted) setSuggestions([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    // excludeKey = version string stable de playlistTracks (allTracks est un
    // nouveau tableau à chaque rendu — dépendre de playlistTracks bouclerait).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlistId, excludeKey]
  );

  // Chargement auto : setState uniquement dans des callbacks async
  // (pattern autorisé — cf. PlaylistPicker), jamais en sync dans l'effet.
  useEffect(() => {
    const ctrl = new AbortController();
    void Promise.resolve().then(() => {
      if (ctrl.signal.aborted) return;
      setLoading(true);
      void load(round, ctrl.signal);
    });
    return () => ctrl.abort();
  }, [load, round]);

  // Après ajout, la playlist parente se resync via router.refresh() :
  // on retire pendant le rendu les titres devenus présents (pattern
  // render-time comme PlaylistView — pas d'effet).
  const [prevExclude, setPrevExclude] = useState(excludeKey);
  if (prevExclude !== excludeKey) {
    setPrevExclude(excludeKey);
    if (suggestions.length > 0) {
      const inPlaylist = new Set(playlistTracks.map((t) => t.id));
      if (suggestions.some((t) => inPlaylist.has(t.id))) {
        setSuggestions(suggestions.filter((t) => !inPlaylist.has(t.id)));
      }
    }
  }

  async function handleAddOne(track: Track) {
    if (!isOwner || addingId) return;
    setAddingId(track.id);
    const ok = await addTrackToPlaylist(playlistId, { ...track, auto: undefined });
    setAddingId(null);
    if (!ok) {
      push(t.common.addImpossible, "error");
      return;
    }
    setSuggestions((prev) => prev.filter((t) => t.id !== track.id));
    push(t.suggestions.addedOne, "success");
    router.refresh();
  }

  async function handleAddAll() {
    if (!isOwner || addingAll || suggestions.length === 0) return;
    setAddingAll(true);
    const clean = suggestions.map((t) => ({ ...t, auto: undefined }));
    const ok = await addTracksToPlaylist(playlistId, clean);
    setAddingAll(false);
    if (!ok) {
      push(t.common.addImpossible, "error");
      return;
    }
    setSuggestions([]);
    push(fmt(t.suggestions.addedMany, { n: clean.length }), "success");
    router.refresh();
  }

  function handleQueue(track: Track) {
    void smartAddToQueue(track).then((r) => {
      usePlayer.getState().setQueueOpen(true);
      toastQueueResult(push, r, track.title);
    });
  }

  // Masqué si playlist vide, ou tant que rien à montrer (exigence produit).
  if (playlistTracks.length === 0) return null;
  if (!loading && suggestions.length === 0) return null;

  return (
    <section className="mt-8" aria-label={t.suggestions.autoLabel}>
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-accent shrink-0" />
        <h2 className="font-display text-[15px] font-semibold text-white tracking-tight">
          {t.suggestions.title}
        </h2>
        <span className="text-[11px] text-ink-muted">{t.suggestions.basedOn}</span>
        <span className="flex-1" />
        <button
          onClick={() => setRound((r) => r + 1)}
          disabled={loading}
          title={t.suggestions.refreshTitle}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-card bg-panel border border-edge text-ink-soft hover:text-white hover:bg-hover text-[12px] font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t.suggestions.refresh}
        </button>
        {isOwner && suggestions.length > 0 && (
          <button
            onClick={() => void handleAddAll()}
            disabled={addingAll}
            className="px-3 py-1.5 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold transition-colors disabled:opacity-50"
          >
            {addingAll ? t.suggestions.adding : fmt(t.suggestions.addAll, { n: suggestions.length })}
          </button>
        )}
      </div>

      {loading && suggestions.length === 0 ? (
        <div className="mt-3 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
              <div className="h-9 w-9 rounded-[6px] bg-hover shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-2/5 rounded bg-hover" />
                <div className="h-2.5 w-1/4 rounded bg-hover" />
              </div>
              <div className="h-7 w-7 rounded-full bg-hover shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
          {suggestions.map((track) => (
            <div
              key={track.id}
              onClick={() => {
                void playTrack(track, suggestions);
              }}
              className="group flex items-center gap-3 px-3 py-2.5 hover:bg-hover transition-colors cursor-pointer"
            >
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px] bg-base flex items-center justify-center">
                {track.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <ListMusic size={14} className="text-ink-muted" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink group-hover:text-accent transition-colors">
                  {track.title}
                </span>
                <span className="block truncate text-[12px] text-ink-muted">
                  {track.artist}
                </span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-panel text-ink-muted border border-edge shrink-0">
                {PLATFORM_LABELS[track.platform]}
              </span>
              <span className="hidden sm:inline text-ink-muted text-[12px] font-mono shrink-0">
                {formatDuration(track.durationMs)}
              </span>
              {isOwner ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleAddOne(track);
                  }}
                  disabled={addingId === track.id}
                  title={fmt(t.suggestions.addOneTitle, { title: track.title })}
                  aria-label={fmt(t.suggestions.addOneAria, { title: track.title })}
                  className="shrink-0 w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-all disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  {addingId === track.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={15} />
                  )}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQueue(track);
                  }}
                  title={fmt(t.suggestions.queueOneTitle, { title: track.title })}
                  aria-label={fmt(t.suggestions.queueOneAria, { title: track.title })}
                  className="shrink-0 w-8 h-8 rounded-full bg-panel border border-edge text-ink-soft hover:text-white hover:bg-hover flex items-center justify-center transition-all sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Plus size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
