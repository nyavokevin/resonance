"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Disc,
  Mic,
  MoreVertical,
  Music2,
  Play,
  Search as SearchIcon,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { detectLink } from "@/lib/detect";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform, type Track } from "@/lib/types";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { toggleLike } from "@/lib/library";
import { shareTrackWithFriend } from "@/lib/dm";
import { useToasts } from "@/lib/toast-store";
import { useSearchStore } from "@/lib/search-store";
import { searchResultToTrack } from "@/lib/youtube-track";
import type {
  SpotifySearchArtist,
  SpotifySearchResult,
  SpotifySearchTrack,
} from "@/lib/providers/spotify-api";
import type { SearchResult } from "@/lib/providers/search";
import { TrackMenu, anchorFromEvent } from "@/components/TrackMenu";
import { Skeleton } from "@/components/Skeleton";
import type { PopoverAnchor } from "@/components/Popover";
import { useT } from "@/lib/i18n/locale-store";
import { fmt, plural, type Dictionary } from "@/lib/i18n/dictionaries";

type Filter = "all" | "track" | "artist" | "album" | "playlist";

function getFilters(t: Dictionary): Array<{ key: Filter; label: string }> {
  return [
    { key: "all", label: t.search.filtersAll },
    { key: "track", label: t.search.filtersTracks },
    { key: "artist", label: t.search.filtersArtists },
    { key: "album", label: t.search.filtersAlbums },
    { key: "playlist", label: t.search.filtersPlaylists },
  ];
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span
      className="shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded text-white"
      style={{ background: PLATFORM_COLORS[platform] }}
    >
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

function TrackRow({
  index,
  track,
  onPlay,
  onMenu,
}: {
  index: number;
  track: Track;
  onPlay: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const t = useT();
  return (
    <div
      onClick={onPlay}
      className="flex items-center justify-between px-3 py-2.5 hover:bg-hover transition-colors group cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative w-6 text-center shrink-0">
          <span className="text-ink-muted text-[12px] font-mono group-hover:hidden">
            {String(index + 1).padStart(2, "0")}
          </span>
          <button
            aria-label={fmt(t.search.playAria, { title: track.title })}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="hidden group-hover:block mx-auto text-accent"
          >
            <Play size={13} fill="currentColor" />
          </button>
        </span>
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-base">
          {track.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-ink-muted">
              <Music2 size={14} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{track.title}</span>
          <span className="block truncate text-[12px] text-ink-soft">{track.artist}</span>
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <PlatformBadge platform={track.platform} />
        <span className="text-ink-muted text-[12px] font-mono w-10 text-right">
          {track.durationMs ? formatMs(track.durationMs) : ""}
        </span>
        <button
          aria-label={fmt(t.search.optionsAria, { title: track.title })}
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e);
          }}
          className="text-ink-muted hover:text-white p-1 transition-colors"
        >
          <MoreVertical size={17} />
        </button>
      </div>
    </div>
  );
}

function formatMs(ms?: number): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function RailCard({
  image,
  round,
  title,
  subtitle,
  onClick,
}: {
  image?: string;
  round?: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-[160px] shrink-0 rounded-card bg-card hover:bg-hover border border-edge p-3 text-left transition-colors"
    >
      <span
        className={`flex h-[120px] w-[120px] items-center justify-center overflow-hidden bg-base ${
          round ? "rounded-full mx-auto" : "rounded-card mx-auto"
        }`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : round ? (
          <Mic size={26} className="text-ink-muted" />
        ) : (
          <Disc size={26} className="text-ink-muted" />
        )}
      </span>
      <span className="mt-2 block truncate text-[13px] font-medium text-ink">{title}</span>
      <span className="block truncate text-[12px] text-ink-soft">{subtitle}</span>
    </button>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">{children}</div>
  );
}

export function SearchView({ recent, initialQuery }: { recent: Track[]; initialQuery?: string }) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const filters = getFilters(t);
  const playTrack = usePlayer((s) => s.playTrack);
  const storeQuery = useSearchStore((s) => s.query);
  const setStoreQuery = useSearchStore((s) => s.setQuery);
  const history = useSearchStore((s) => s.history);
  const loadHistory = useSearchStore((s) => s.loadHistory);
  const rememberSearch = useSearchStore((s) => s.remember);
  const removeHistory = useSearchStore((s) => s.removeHistory);
  const clearHistory = useSearchStore((s) => s.clearHistory);

  const [filter, setFilter] = useState<Filter>("all");
  const [spotify, setSpotify] = useState<SpotifySearchResult | null>(null);
  const [ytResults, setYtResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRunQuery = useRef<string | null>(null);
  const menuListRef = useRef<Track[]>([]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ?q= deep-link (ex. boutons Ambiances de /discover) : alimente la
  // requête partagée une fois, sans écraser la frappe en cours.
  const initialApplied = useRef(false);
  useEffect(() => {
    if (initialApplied.current) return;
    if (!initialQuery || initialQuery.trim().length < 2) return;
    if (storeQuery.trim().length >= 2) {
      initialApplied.current = true;
      return;
    }
    initialApplied.current = true;
    setStoreQuery(initialQuery.trim());
  }, [initialQuery, storeQuery, setStoreQuery]);

  const runSearch = useCallback(
    async (q: string, opts?: { type?: Filter; source?: string }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        if (opts?.type && opts.type !== "all") params.set("type", opts.type);
        if (opts?.source) params.set("source", opts.source);
        else if (!opts?.type || opts.type === "all" || opts.type === "track") {
          // Filtre "Titres" et vue "Tout" : 12 résultats par type.
          params.set("limit", opts?.type === "all" ? "8" : "12");
        }
        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error();
        if (data.source === "spotify") {
          setSpotify({
            tracks: data.tracks ?? [],
            albums: data.albums ?? [],
            artists: data.artists ?? [],
            playlists: data.playlists ?? [],
          });
          setYtResults([]);
        } else {
          setSpotify(null);
          setYtResults(data.results ?? []);
        }
        setSearched(true);
        rememberSearch(q);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        push(t.search.searchUnavailable, "error");
      } finally {
        setLoading(false);
      }
    },
    [push, rememberSearch, t]
  );

  // Recherche débounce 400ms sur la requête partagée (header + page).
  // Le filtre actif (type Spotify) fait partie de la clé : changer de
  // filtre relance une recherche ciblée (12 résultats du type).
  useEffect(() => {
    const q = storeQuery.trim();
    if (detectLink(storeQuery) || q.length < 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      lastRunQuery.current = null;
      // Reset différé (setState asynchrone, pas de cascade de rendus).
      queueMicrotask(() => {
        setLoading(false);
        setSearched(false);
        setSpotify(null);
        setYtResults([]);
      });
      return;
    }
    const key = `${filter}:${q}`;
    if (key === lastRunQuery.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastRunQuery.current = key;
      void runSearch(q, { type: filter });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [storeQuery, filter, runSearch]);

  async function resolveSpotifyTrack(s: SpotifySearchTrack): Promise<Track | null> {
    try {
      const res = await fetch("/api/resolve-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "spotify",
          trackId: s.spotifyId,
          isrc: s.isrc,
          title: s.title,
          artist: s.artists,
          durationMs: s.durationMs,
          album: s.album,
          coverUrl: s.coverUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      return data.track as Track;
    } catch {
      return null;
    }
  }

  async function handleSpotifyTrack(s: SpotifySearchTrack) {
    const track = await resolveSpotifyTrack(s);
    if (!track) {
      push(t.common.unreadableTitle, "error");
      return;
    }
    await playTrack(track, [track]);
    push(fmt(t.search.playTitle, { title: track.title }), "success");
  }

  /** ▶ sur un artiste : top titres (search) → pipeline de résolution → lecture. */
  async function handleArtistPlay(a: SpotifySearchArtist) {
    try {
      const res = await fetch(
        `/api/search?${new URLSearchParams({ q: a.name, type: "track", limit: "8" }).toString()}`
      );
      const data = await res.json();
      if (!res.ok || data.source !== "spotify" || !data.tracks?.length) {
        push(t.search.artistPlayImpossible, "error");
        return;
      }
      const candidates = (data.tracks as SpotifySearchTrack[]).slice(0, 6);
      const resolved: Track[] = [];
      for (let i = 0; i < candidates.length; i += 3) {
        const batch = candidates.slice(i, i + 3);
        const out = await Promise.all(batch.map((t) => resolveSpotifyTrack(t)));
        resolved.push(...out.filter((t): t is Track => t !== null));
      }
      if (!resolved.length) {
        push(t.search.titlesUnreadable, "error");
        return;
      }
      await playTrack(resolved[0], resolved);
      const missing = candidates.length - resolved.length;
      push(
        missing > 0
          ? fmt(t.search.mixResolved, { name: a.name, x: resolved.length, y: candidates.length, missing, s: plural(missing) })
          : fmt(t.search.mixOk, { name: a.name, x: resolved.length, y: candidates.length }),
        missing > 0 ? "info" : "success"
      );
      router.refresh();
    } catch {
      push(t.common.playError, "error");
    }
  }

  function handleShare(track: Track) {
    const url = track.sourceUrl;
    if (!url) {
      push(t.search.nothingToShare, "error");
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => push(t.common.linkCopied, "success"))
      .catch(() => push(t.common.copyFailed, "error"));
  }

  /** 3 requêtes proches quand aucun résultat (variantes de la query). */
  function suggestQueries(q: string): string[] {
    const tokens = q.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    if (tokens.length > 1) {
      out.push(tokens[0]);
      out.push(tokens.slice(0, 2).join(" "));
    }
    out.push(`${q} mix`);
    return [...new Set(out)].filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 3);
  }

  function handleYtPlay(result: SearchResult) {
    const track = searchResultToTrack(result);
    void playTrack(track, [track]).then(() => router.refresh());
    push(fmt(t.search.playTitle, { title: track.title }), "success");
  }

  function handleUrlDetected() {
    const detected = detectLink(storeQuery);
    if (!detected) return;
    void (async () => {
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: storeQuery.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          push(data.error ?? t.common.unreadableLink, "error");
          return;
        }
        const tracks = data.tracks as Track[];
        await playTrack(tracks[0], tracks);
        push(
          data.kind === "track" || data.kind === "direct"
            ? fmt(t.search.playTitle, { title: tracks[0].title })
            : fmt(t.search.collectionAdded, { title: data.collectionTitle }),
          "success"
        );
      } catch {
        push(t.common.networkError, "error");
      }
    })();
  }

  function handleImportDetected() {
    const detected = detectLink(storeQuery);
    if (!detected) return;
    if (detected.platform === "spotify" && (detected.kind === "album" || detected.kind === "playlist")) {
      router.push(`/import/spotify/${detected.id}?type=${detected.kind}`);
      return;
    }
    push(t.search.importHint, "info");
  }

  const detected = detectLink(storeQuery);
  const query = storeQuery.trim();
  const hasResults =
    (spotify &&
      (spotify.tracks.length ||
        spotify.albums.length ||
        spotify.artists.length ||
        spotify.playlists.length)) ||
    ytResults.length > 0;

  function trackMenu(onRemove?: () => void, removeLabel?: string) {
    if (!menuTrack) return null;
    return (
      <TrackMenu
        track={menuTrack}
        anchor={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuTrack(null);
        }}
        actions={{
          onPlay: () => {
            void playTrack(menuTrack, menuListRef.current).then(() => router.refresh());
          },
          playLabel: t.search.playLabel,
          onPlayNext: () =>
            void smartPlayNext(menuTrack).then((r) =>
              toastQueueResult(push, r, menuTrack.title)
            ),
          onAddToQueue: () =>
            void smartAddToQueue(menuTrack).then((r) => {
              usePlayer.getState().setQueueOpen(true);
              toastQueueResult(push, r, menuTrack.title);
            }),
          onLike: () =>
            void toggleLike(menuTrack).then((ok) =>
              push(
                ok === false ? t.common.likeImpossible : ok ? t.common.likeAdded : t.common.likeRemoved,
                ok === false ? "error" : "success"
              )
            ),
          onShare: () => handleShare(menuTrack),
          onShareToFriend: async (friendId) => {
            const convId = await shareTrackWithFriend(menuTrack, friendId);
            push(
              convId ? t.chat.trackShared : t.common.operationImpossible,
              convId ? "success" : "error"
            );
            return convId;
          },
          ...(onRemove ? { onRemove, removeLabel } : {}),
        }}
      />
    );
  }

  const sectionTitleClass =
    "font-display text-[16px] font-semibold text-white tracking-tight";
  const seeAllClass = "text-[12px] text-ink-muted hover:text-white transition-colors";

  return (
    <div className="pt-2">
      {/* Grande barre de recherche */}
      <div className="max-w-2xl mx-auto w-full mb-4">
        <div className="relative">
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={storeQuery}
            onChange={(e) => setStoreQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setStoreQuery("");
            }}
            placeholder={t.search.searchPlaceholder}
            className="w-full h-12 rounded-card border border-edge bg-card pl-11 pr-10 text-[14px] text-white placeholder:text-ink-muted outline-none transition-colors duration-150 focus:border-accent"
          />
          {storeQuery && (
            <button
              onClick={() => setStoreQuery("")}
              aria-label={t.search.clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Chips historique */}
        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {history.map((h) => (
              <span
                key={h.query}
                className="group inline-flex items-center gap-1 rounded-full border border-edge bg-card px-3 py-1 text-[12px] text-ink-soft hover:text-white transition-colors"
              >
                <button onClick={() => setStoreQuery(h.query)} className="max-w-[180px] truncate">
                  {h.query}
                </button>
                <button
                  onClick={() => removeHistory(h.query)}
                  aria-label={fmt(t.search.clearQuery, { query: h.query })}
                  className="text-ink-muted hover:text-bad transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              onClick={clearHistory}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ink-muted hover:text-white transition-colors"
            >
              <Trash2 size={12} />
              {t.search.clearAll}
            </button>
          </div>
        )}

        {/* Pills filtres */}
        {searched && (
          <div className="sticky top-[72px] z-20 mt-3 flex gap-1.5 overflow-x-auto py-1.5 bg-base/95 backdrop-blur">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                  filter === f.key
                    ? "bg-accent text-white"
                    : "bg-card border border-edge text-ink-soft hover:bg-hover hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* URL détecté */}
      {detected && (
        <section className="mb-6 rounded-card border border-edge bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 max-w-2xl mx-auto">
          <div className="min-w-0 flex-1">
            <PlatformBadge platform={detected.platform} />
            <p className="mt-1.5 truncate text-[13px] text-ink-soft">{storeQuery}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleUrlDetected}
              className="rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold px-4 py-2 transition-colors"
            >
              {t.search.listenAction}
            </button>
            <button
              onClick={handleImportDetected}
              className="rounded-card border border-edge bg-panel hover:bg-hover text-white text-[12px] font-medium px-4 py-2 transition-colors"
            >
              {t.search.importAction}
            </button>
          </div>
        </section>
      )}

      {/* États */}
      {loading && !hasResults && (
        <div className="max-w-4xl space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!loading && !query && (
        <div className="max-w-4xl">
          <h2 className={sectionTitleClass}>{t.search.recentSearches}</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-muted">
              {t.search.typeToStart}
            </p>
          ) : null}
          <h2 className={`${sectionTitleClass} mt-6`}>{t.search.recentlyPlayed}</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {recent.slice(0, 6).map((track) => (
              <div
                key={track.id}
                onClick={() => {
                  void playTrack(track, recent).then(() => router.refresh());
                }}
                className="group flex items-center gap-3 p-2 rounded-card bg-card hover:bg-hover border border-edge transition-colors cursor-pointer"
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-card bg-base">
                  {track.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-ink-muted">
                      <Music2 size={14} />
                    </span>
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
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && query && searched && !hasResults && (
        <div className="max-w-md mx-auto text-center py-12">
          <SearchX size={36} className="mx-auto text-ink-muted" />
          <p className="mt-3 text-[15px] font-semibold text-white">
            {fmt(t.search.noResults, { query })}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {t.search.checkSpelling}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {suggestQueries(query).map((s) => (
              <button
                key={s}
                onClick={() => setStoreQuery(s)}
                className="rounded-full border border-edge bg-card px-3 py-1 text-[12px] text-ink-soft hover:text-white hover:bg-hover transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => void runSearch(query, { source: "youtube" })}
            className="mt-4 rounded-card border border-edge bg-panel hover:bg-hover text-white text-[12px] font-medium px-4 py-2 transition-colors"
          >
            {t.search.retryYoutube}
          </button>
        </div>
      )}

      {!loading && hasResults && (
        <div className="space-y-8 max-w-4xl">
          {filter === "all" && (
            <>
              {/* Meilleur résultat : 1er artiste si la query matche un
                  artiste (logique Spotify), sinon 1er titre. */}
              {(() => {
                const topArtist = spotify?.artists[0];
                const topSpotifyTrack = spotify?.tracks[0];
                const topYt = !topSpotifyTrack ? ytResults[0] : undefined;
                if (!topArtist && !topSpotifyTrack && !topYt) return null;
                if (topArtist) {
                  return (
                    <section>
                      <h2 className={sectionTitleClass}>{t.search.bestResult}</h2>
                      <div
                        onClick={() => router.push(`/artist/spotify/${topArtist.id}`)}
                        className="mt-3 flex items-center gap-4 rounded-card bg-card hover:bg-hover border border-edge p-4 transition-colors cursor-pointer w-full max-w-[380px] min-h-[140px]"
                      >
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-base">
                          {topArtist.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={topArtist.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <Mic size={22} className="text-ink-muted" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-bold text-white">
                            {topArtist.name}
                          </span>
                          <span className="block text-[12px] text-ink-soft">{t.search.artist}</span>
                        </span>
                        <button
                          aria-label={fmt(t.search.listenAria, { name: topArtist.name })}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleArtistPlay(topArtist);
                          }}
                          className="shrink-0 rounded-full bg-accent hover:bg-accent-hover p-3 text-white transition-colors shadow"
                        >
                          <Play size={18} fill="currentColor" />
                        </button>
                      </div>
                    </section>
                  );
                }
                const title = topSpotifyTrack ? topSpotifyTrack.title : topYt!.title;
                const artist = topSpotifyTrack ? topSpotifyTrack.artists : topYt!.channel;
                const cover = topSpotifyTrack ? topSpotifyTrack.coverUrl : topYt!.thumbnail;
                return (
                  <section>
                    <h2 className={sectionTitleClass}>{t.search.bestResult}</h2>
                    <div className="mt-3 flex items-center gap-4 rounded-card bg-card hover:bg-hover border border-edge p-4 transition-colors cursor-pointer w-full max-w-[380px] min-h-[140px]"
                      onClick={() =>
                        topSpotifyTrack
                          ? void handleSpotifyTrack(topSpotifyTrack)
                          : handleYtPlay(topYt!)
                      }
                    >
                      <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card bg-base">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <Music2 size={22} className="text-ink-muted" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-bold text-white">
                          {title}
                        </span>
                        <span className="block truncate text-[12px] text-ink-soft">
                          {fmt(t.search.artistTitleSuffix, { artist })}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-accent p-3 text-white shadow">
                        <Play size={18} fill="currentColor" />
                      </span>
                    </div>
                  </section>
                );
              })()}

              {/* Titres */}
              {(spotify?.tracks.length ?? 0) > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <h2 className={sectionTitleClass}>{t.search.filtersTracks}</h2>
                    <button onClick={() => setFilter("track")} className={seeAllClass}>
                      {t.search.seeAll}
                    </button>
                  </div>
                  <div className="mt-2 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
                    {spotify!.tracks.slice(0, 4).map((stk, i) => (
                      <TrackRow
                        key={stk.spotifyId}
                        index={i}
                        track={{
                          id: `spotify:track:${stk.spotifyId}`,
                          platform: "spotify",
                          platformTrackId: stk.spotifyId,
                          title: stk.title,
                          artist: stk.artists,
                          coverUrl: stk.coverUrl,
                          sourceUrl: `https://open.spotify.com/track/${stk.spotifyId}`,
                          durationMs: stk.durationMs,
                        }}
                        onPlay={() => void handleSpotifyTrack(stk)}
                        onMenu={(e) => {
                          e.stopPropagation();
                          void resolveSpotifyTrack(stk).then((resolved) => {
                            if (!resolved) {
                              push(t.common.unreadableTitle, "error");
                              return;
                            }
                            menuListRef.current = [resolved]; setMenuTrack(resolved);
                            setMenuAnchor(anchorFromEvent(e));
                          });
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {(ytResults.length > 0) && (
                <section>
                  <h2 className={sectionTitleClass}>{t.search.youtubeTracks}</h2>
                  <div className="mt-2 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
                    {ytResults.slice(0, 4).map((r, i) => (
                      <TrackRow
                        key={r.videoId}
                        index={i}
                        track={searchResultToTrack(r)}
                        onPlay={() => handleYtPlay(r)}
                        onMenu={(e) => {
                          e.stopPropagation();
                          const mt = searchResultToTrack(r); menuListRef.current = [mt]; setMenuTrack(mt);
                          setMenuAnchor(anchorFromEvent(e));
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Artistes */}
              {(spotify?.artists.length ?? 0) > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <h2 className={sectionTitleClass}>{t.search.filtersArtists}</h2>
                    <button onClick={() => setFilter("artist")} className={seeAllClass}>
                      {t.search.seeAll}
                    </button>
                  </div>
                  <Rail>
                    {spotify!.artists.map((a) => (
                      <RailCard
                        key={a.id}
                        round
                        image={a.imageUrl}
                        title={a.name}
                        subtitle={t.search.artist}
                        onClick={() => router.push(`/artist/spotify/${a.id}`)}
                      />
                    ))}
                  </Rail>
                </section>
              )}

              {/* Albums */}
              {(spotify?.albums.length ?? 0) > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <h2 className={sectionTitleClass}>{t.search.filtersAlbums}</h2>
                    <button onClick={() => setFilter("album")} className={seeAllClass}>
                      {t.search.seeAll}
                    </button>
                  </div>
                  <Rail>
                    {spotify!.albums.map((a) => (
                      <RailCard
                        key={a.id}
                        image={a.coverUrl}
                        title={a.name}
                        subtitle={`${a.artist}${a.releaseDate ? ` · ${a.releaseDate.slice(0, 4)}` : ""}`}
                        onClick={() => router.push(`/import/spotify/${a.id}?type=album`)}
                      />
                    ))}
                  </Rail>
                </section>
              )}

              {/* Playlists */}
              {(spotify?.playlists.length ?? 0) > 0 && (
                <section>
                  <div className="flex items-center justify-between">
                    <h2 className={sectionTitleClass}>{t.search.filtersPlaylists}</h2>
                    <button onClick={() => setFilter("playlist")} className={seeAllClass}>
                      {t.search.seeAll}
                    </button>
                  </div>
                  <Rail>
                    {spotify!.playlists.map((p) => (
                      <RailCard
                        key={p.id}
                        image={p.coverUrl}
                        title={p.name}
                        subtitle={fmt(t.common.byArtist, { owner: p.owner })}
                        onClick={() => router.push(`/import/spotify/${p.id}?type=playlist`)}
                      />
                    ))}
                  </Rail>
                </section>
              )}
            </>
          )}

          {filter === "track" && (
            <section>
              <h2 className={sectionTitleClass}>{t.search.filtersTracks}</h2>
              <div className="mt-2 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
                {(spotify?.tracks ?? []).map((stk, i) => (
                  <TrackRow
                    key={stk.spotifyId}
                    index={i}
                    track={{
                      id: `spotify:track:${stk.spotifyId}`,
                      platform: "spotify",
                      platformTrackId: stk.spotifyId,
                      title: stk.title,
                      artist: stk.artists,
                      coverUrl: stk.coverUrl,
                      sourceUrl: `https://open.spotify.com/track/${stk.spotifyId}`,
                      durationMs: stk.durationMs,
                    }}
                    onPlay={() => void handleSpotifyTrack(stk)}
                    onMenu={(e) => {
                      e.stopPropagation();
                      void resolveSpotifyTrack(stk).then((resolved) => {
                        if (!resolved) {
                          push(t.common.unreadableTitle, "error");
                          return;
                        }
                        menuListRef.current = [resolved]; setMenuTrack(resolved);
                        setMenuAnchor(anchorFromEvent(e));
                      });
                    }}
                  />
                ))}
                {ytResults.map((r, i) => (
                  <TrackRow
                    key={r.videoId}
                    index={(spotify?.tracks.length ?? 0) + i}
                    track={searchResultToTrack(r)}
                    onPlay={() => handleYtPlay(r)}
                    onMenu={(e) => {
                      e.stopPropagation();
                      const mt = searchResultToTrack(r); menuListRef.current = [mt]; setMenuTrack(mt);
                      setMenuAnchor(anchorFromEvent(e));
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {filter === "artist" && spotify && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {spotify.artists.map((a) => (
                <RailCard
                  key={a.id}
                  round
                  image={a.imageUrl}
                  title={a.name}
                  subtitle={t.search.artist}
                  onClick={() => router.push(`/artist/spotify/${a.id}`)}
                />
              ))}
            </div>
          )}

          {filter === "album" && spotify && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {spotify.albums.map((a) => (
                <RailCard
                  key={a.id}
                  image={a.coverUrl}
                  title={a.name}
                  subtitle={`${a.artist}${a.releaseDate ? ` · ${a.releaseDate.slice(0, 4)}` : ""}`}
                  onClick={() => router.push(`/import/spotify/${a.id}?type=album`)}
                />
              ))}
            </div>
          )}

          {filter === "playlist" && spotify && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {spotify.playlists.map((p) => (
                <RailCard
                  key={p.id}
                  image={p.coverUrl}
                  title={p.name}
                  subtitle={fmt(t.common.byArtist, { owner: p.owner })}
                  onClick={() => router.push(`/import/spotify/${p.id}?type=playlist`)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {trackMenu()}
    </div>
  );
}