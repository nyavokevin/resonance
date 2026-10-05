"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Music2, Play, Shuffle } from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { useToasts } from "@/lib/toast-store";
import { formatDuration } from "@/components/TrackList";
import type { Track } from "@/lib/types";
import { useT } from "@/lib/i18n/locale-store";
import { fmt, plural } from "@/lib/i18n/dictionaries";
import type { SpotifySearchTrack } from "@/lib/providers/spotify-api";
import type { SearchResult } from "@/lib/providers/search";

/** Résout un titre Spotify en piste jouable (YouTube ou Spotify). */
async function resolveOne(item: SpotifySearchTrack): Promise<Track | null> {
  try {
    const res = await fetch("/api/resolve-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "spotify",
        trackId: item.spotifyId,
        isrc: item.isrc,
        title: item.title,
        artist: item.artists,
        album: item.album,
        coverUrl: item.coverUrl,
        durationMs: item.durationMs,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.track) return null;
    return data.track as Track;
  } catch {
    return null;
  }
}

/** YouTube → Track jouable directement (dernier recours, sans resolve). */
function toYoutubeTrack(r: SearchResult): Track {
  return {
    id: `youtube:track:${r.videoId}`,
    platform: "youtube",
    platformTrackId: r.videoId,
    title: r.title,
    artist: r.channel,
    coverUrl: r.thumbnail,
    sourceUrl: `https://www.youtube.com/watch?v=${r.videoId}`,
    durationMs: r.durationMs,
  };
}

export function GenreTrackList({
  tracks,
  youtubeTracks = [],
  genreName,
  hasPlaylists = false,
}: {
  tracks: SpotifySearchTrack[];
  /** Dernier recours serveur (panne Spotify totale) : lecture directe. */
  youtubeTracks?: SearchResult[];
  genreName: string;
  /** Vrai si la page liste aussi des playlists : guide vers elles en cas de vide. */
  hasPlaylists?: boolean;
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const playTrack = usePlayer((s) => s.playTrack);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState<"all" | "shuffle" | null>(null);

  const busy = resolvingId !== null || busyAll !== null;
  // Mode YouTube uniquement quand Spotify n'a strictement rien renvoyé.
  const isYoutube = tracks.length === 0 && youtubeTracks.length > 0;
  const ytQueue: Track[] = isYoutube ? youtubeTracks.map(toYoutubeTrack) : [];
  const total = isYoutube ? youtubeTracks.length : tracks.length;

  /** Résout tout le rail Spotify (×3 en parallèle, comme DiscoverView.buildMix). */
  async function resolveAll(): Promise<Track[]> {
    const resolved: Track[] = [];
    for (let i = 0; i < tracks.length; i += 3) {
      const batch = tracks.slice(i, i + 3);
      const results = await Promise.all(
        batch.map((item) => resolveOne(item).catch(() => null))
      );
      for (const r of results) if (r) resolved.push(r);
    }
    return resolved;
  }

  async function playOne(item: SpotifySearchTrack) {
    if (busy || isYoutube) return;
    setResolvingId(item.spotifyId);
    try {
      const track = await resolveOne(item);
      if (!track) {
        push(t.discover.trackUnavailable, "error");
        return;
      }
      await playTrack(track, [track]);
      router.refresh();
    } catch {
      push(t.common.playError, "error");
    } finally {
      setResolvingId(null);
    }
  }

  /** Lecture directe d'un résultat YouTube (déjà résolu côté serveur). */
  async function playOneYoutube(index: number) {
    if (busy || !isYoutube) return;
    const track = ytQueue[index];
    if (!track) return;
    try {
      await playTrack(track, ytQueue);
      router.refresh();
    } catch {
      push(t.common.playError, "error");
    }
  }

  async function playAll(shuffle: boolean) {
    if (busy || total === 0) return;
    setBusyAll(shuffle ? "shuffle" : "all");
    try {
      // Dernier recours YouTube : file déjà résolue, lecture immédiate.
      const base: Track[] = isYoutube ? ytQueue : await resolveAll();
      if (base.length === 0) {
        push(t.discover.trackUnavailable, "error");
        return;
      }
      const queue = shuffle
        ? [...base].sort(() => Math.random() - 0.5)
        : base;
      await playTrack(queue[0], queue);
      push(
        fmt(t.discover.mixLaunched, {
          label: genreName,
          x: queue.length,
          total,
        }),
        "success"
      );
      router.refresh();
    } catch {
      push(t.common.playError, "error");
    } finally {
      setBusyAll(null);
    }
  }

  // Vide réel : toutes les sources serveur (Spotify ×4 + YouTube)
  // ont été épuisées par la page avant d'arriver ici.
  if (tracks.length === 0 && youtubeTracks.length === 0) {
    return (
      <section className="mt-6 rounded-card border border-edge bg-card p-6 text-center">
        <Music2 size={22} className="mx-auto text-ink-muted" />
        <p className="mt-2 text-[13px] text-ink-soft">{t.discover.noTopTracks}</p>
        {hasPlaylists && (
          <p className="mt-1 text-[12px] text-ink-muted">
            {t.discover.playlistsTitle} ↓
          </p>
        )}
        <button
          onClick={() => router.refresh()}
          className="mt-4 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold px-4 py-2 transition-colors"
        >
          {t.common.retry}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[16px] font-semibold text-white tracking-tight">
          {t.discover.topTracks}
          <span className="ml-2 text-[12px] font-normal text-ink-muted">
            {fmt(t.common.titlesCountWithSuffix, {
              n: total,
              s: plural(total),
            })}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void playAll(false)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            {busyAll === "all" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            {t.discover.playAll}
          </button>
          <button
            onClick={() => void playAll(true)}
            disabled={busy}
            aria-label={t.discover.shuffle}
            title={t.discover.shuffle}
            className="flex h-8 w-8 items-center justify-center rounded-card border border-edge bg-panel text-ink-soft hover:text-white hover:bg-hover transition-colors disabled:opacity-60"
          >
            {busyAll === "shuffle" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Shuffle size={14} />
            )}
          </button>
        </div>
      </div>

      <div className="rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
        {isYoutube
          ? youtubeTracks.map((item, i) => (
              <div
                key={`${item.videoId}:${i}`}
                onClick={() => void playOneYoutube(i)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover transition-colors group cursor-pointer"
              >
                <span className="text-ink-muted text-[12px] font-mono w-6 text-center shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-base">
                  {item.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-ink-muted">
                      <Music2 size={14} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                    {item.title}
                  </span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {item.channel}
                  </span>
                </span>
                <span className="text-ink-muted text-[12px] font-mono shrink-0">
                  {formatDuration(item.durationMs)}
                </span>
              </div>
            ))
          : tracks.map((item, i) => {
              const resolving = resolvingId === item.spotifyId;
              return (
                <div
                  key={`${item.spotifyId}:${i}`}
                  onClick={() => void playOne(item)}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover transition-colors group cursor-pointer"
                >
                  <span className="text-ink-muted text-[12px] font-mono w-6 text-center shrink-0">
                    {resolving ? (
                      <Loader2 size={13} className="mx-auto animate-spin text-accent" />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-base">
                    {item.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.coverUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-muted">
                        <Music2 size={14} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                      {item.title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-soft">
                      {item.artists}
                      {resolving ? ` · ${t.discover.resolving}` : ""}
                    </span>
                  </span>
                  <span className="text-ink-muted text-[12px] font-mono shrink-0">
                    {formatDuration(item.durationMs)}
                  </span>
                </div>
              );
            })}
      </div>
    </section>
  );
}
