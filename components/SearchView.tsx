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

type Filter = "all" | "track" | "artist" | "album" | "playlist";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Tout" },
  { key: "track", label: "Titres" },
  { key: "artist", label: "Artistes" },
  { key: "album", label: "Albums" },
  { key: "playlist", label: "Playlists" },
];

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
            aria-label={`Lire ${track.title}`}
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
          aria-label={`Options pour ${track.title}`}
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
        push("Recherche indisponible.", "error");
      } finally {
        setLoading(false);
      }
    },
    [push, rememberSearch]
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

  async function resolveSpotifyTrack(t: SpotifySearchTrack): Promise<Track | null> {
    try {
      const res = await fetch("/api/resolve-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "spotify",
          trackId: t.spotifyId,
          isrc: t.isrc,
          title: t.title,
          artist: t.artists,
          durationMs: t.durationMs,
          album: t.album,
          coverUrl: t.coverUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      return data.track as Track;
    } catch {
      return null;
    }
  }

  async function handleSpotifyTrack(t: SpotifySearchTrack) {
    const track = await resolveSpotifyTrack(t);
    if (!track) {
      push("Titre illisible.", "error");
      return;
    }
    await playTrack(track, [track]);
    push(`Lecture : ${track.title}`, "success");
  }

  /** ▶ sur un artiste : top titres (search) → pipeline de résolution → lecture. */
  async function handleArtistPlay(a: SpotifySearchArtist) {
    try {
      const res = await fetch(
        `/api/search?${new URLSearchParams({ q: a.name, type: "track", limit: "8" }).toString()}`
      );
      const data = await res.json();
      if (!res.ok || data.source !== "spotify" || !data.tracks?.length) {
        push("Lecture impossible pour cet artiste.", "error");
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
        push("Titres illisibles.", "error");
        return;
      }
      await playTrack(resolved[0], resolved);
      const missing = candidates.length - resolved.length;
      push(
        missing > 0
          ? `Mix ${a.name} — ${resolved.length}/${candidates.length} titres résolus (${missing} introuvable${missing > 1 ? "s" : ""} ⚠)`
          : `Mix ${a.name} — ${resolved.length}/${candidates.length} titres résolus ✓`,
        missing > 0 ? "info" : "success"
      );
      router.refresh();
    } catch {
      push("Lecture impossible.", "error");
    }
  }

  function handleShare(track: Track) {
    const url = track.sourceUrl;
    if (!url) {
      push("Rien à partager.", "error");
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => push("Lien copié ✓", "success"))
      .catch(() => push("Copie impossible", "error"));
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
    push(`Lecture : ${track.title}`, "success");
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
          push(data.error ?? "Lien illisible.", "error");
          return;
        }
        const tracks = data.tracks as Track[];
        await playTrack(tracks[0], tracks);
        push(
          data.kind === "track" || data.kind === "direct"
            ? `Lecture : ${tracks[0].title}`
            : `Collection ajoutée : ${data.collectionTitle}`,
          "success"
        );
      } catch {
        push("Erreur réseau.", "error");
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
    push("Import : colle ce lien sur la page d'accueil.", "info");
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
          playLabel: "Lire",
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
                ok === false ? "Impossible d'aimer" : ok ? "Ajouté aux titres aimés ✓" : "Retiré des titres aimés",
                ok === false ? "error" : "success"
              )
            ),
          onShare: () => handleShare(menuTrack),
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
            placeholder="Titres, artistes, albums, playlists ou colle un lien Spotify / YouTube…"
            className="w-full h-12 rounded-card border border-edge bg-card pl-11 pr-10 text-[14px] text-white placeholder:text-ink-muted outline-none transition-colors duration-150 focus:border-accent"
          />
          {storeQuery && (
            <button
              onClick={() => setStoreQuery("")}
              aria-label="Effacer"
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
                  aria-label={`Effacer ${h.query}`}
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
              Tout effacer
            </button>
          </div>
        )}

        {/* Pills filtres */}
        {searched && (
          <div className="sticky top-[72px] z-20 mt-3 flex gap-1.5 overflow-x-auto py-1.5 bg-base/95 backdrop-blur">
            {FILTERS.map((f) => (
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
              Écouter
            </button>
            <button
              onClick={handleImportDetected}
              className="rounded-card border border-edge bg-panel hover:bg-hover text-white text-[12px] font-medium px-4 py-2 transition-colors"
            >
              Importer
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
          <h2 className={sectionTitleClass}>Recherches récentes</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-muted">
              Tape un titre, un artiste, ou colle un lien pour commencer.
            </p>
          ) : null}
          <h2 className={`${sectionTitleClass} mt-6`}>Titres écoutés récemment</h2>
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
            Aucun résultat pour « {query} »
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            Vérifie l&apos;orthographe ou essaie une de ces recherches :
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
            Réessayer sur YouTube
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
                      <h2 className={sectionTitleClass}>Meilleur résultat</h2>
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
                          <span className="block text-[12px] text-ink-soft">Artiste</span>
                        </span>
                        <button
                          aria-label={`Écouter ${topArtist.name}`}
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
                    <h2 className={sectionTitleClass}>Meilleur résultat</h2>
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
                          {artist} · Titre
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
                    <h2 className={sectionTitleClass}>Titres</h2>
                    <button onClick={() => setFilter("track")} className={seeAllClass}>
                      Tout voir →
                    </button>
                  </div>
                  <div className="mt-2 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
                    {spotify!.tracks.slice(0, 4).map((t, i) => (
                      <TrackRow
                        key={t.spotifyId}
                        index={i}
                        track={{
                          id: `spotify:track:${t.spotifyId}`,
                          platform: "spotify",
                          platformTrackId: t.spotifyId,
                          title: t.title,
                          artist: t.artists,
                          coverUrl: t.coverUrl,
                          sourceUrl: `https://open.spotify.com/track/${t.spotifyId}`,
                          durationMs: t.durationMs,
                        }}
                        onPlay={() => void handleSpotifyTrack(t)}
                        onMenu={(e) => {
                          e.stopPropagation();
                          void resolveSpotifyTrack(t).then((resolved) => {
                            if (!resolved) {
                              push("Titre illisible.", "error");
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
                  <h2 className={sectionTitleClass}>Titres (YouTube)</h2>
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
                    <h2 className={sectionTitleClass}>Artistes</h2>
                    <button onClick={() => setFilter("artist")} className={seeAllClass}>
                      Tout voir →
                    </button>
                  </div>
                  <Rail>
                    {spotify!.artists.map((a) => (
                      <RailCard
                        key={a.id}
                        round
                        image={a.imageUrl}
                        title={a.name}
                        subtitle="Artiste"
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
                    <h2 className={sectionTitleClass}>Albums</h2>
                    <button onClick={() => setFilter("album")} className={seeAllClass}>
                      Tout voir →
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
                    <h2 className={sectionTitleClass}>Playlists</h2>
                    <button onClick={() => setFilter("playlist")} className={seeAllClass}>
                      Tout voir →
                    </button>
                  </div>
                  <Rail>
                    {spotify!.playlists.map((p) => (
                      <RailCard
                        key={p.id}
                        image={p.coverUrl}
                        title={p.name}
                        subtitle={`Par ${p.owner}`}
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
              <h2 className={sectionTitleClass}>Titres</h2>
              <div className="mt-2 rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
                {(spotify?.tracks ?? []).map((t, i) => (
                  <TrackRow
                    key={t.spotifyId}
                    index={i}
                    track={{
                      id: `spotify:track:${t.spotifyId}`,
                      platform: "spotify",
                      platformTrackId: t.spotifyId,
                      title: t.title,
                      artist: t.artists,
                      coverUrl: t.coverUrl,
                      sourceUrl: `https://open.spotify.com/track/${t.spotifyId}`,
                      durationMs: t.durationMs,
                    }}
                    onPlay={() => void handleSpotifyTrack(t)}
                    onMenu={(e) => {
                      e.stopPropagation();
                      void resolveSpotifyTrack(t).then((resolved) => {
                        if (!resolved) {
                          push("Titre illisible.", "error");
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
                  subtitle="Artiste"
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
                  subtitle={`Par ${p.owner}`}
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