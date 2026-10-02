"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Music2, Link2, Play, MoreHorizontal, Disc, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { detectLink } from "@/lib/detect";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform, type Track } from "@/lib/types";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import type { SearchResult } from "@/lib/providers/search";
import type {
  SpotifySearchAlbum,
  SpotifySearchArtist,
  SpotifySearchPlaylist,
  SpotifySearchResult,
  SpotifySearchTrack,
} from "@/lib/providers/spotify-api";
import { TrackMenu, anchorFromEvent } from "@/components/TrackMenu";
import type { PopoverAnchor } from "@/components/Popover";
import { useSearchStore } from "@/lib/search-store";
import { searchResultToTrack } from "@/lib/youtube-track";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

function formatDuration(ms?: number): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatFollowers(n?: number): string {
  if (n === undefined) return "";
  return new Intl.NumberFormat("fr", { notation: "compact" }).format(n);
}

type FlatItem =
  | { kind: "track"; track: SpotifySearchTrack }
  | { kind: "album"; album: SpotifySearchAlbum }
  | { kind: "artist"; artist: SpotifySearchArtist }
  | { kind: "playlist"; playlist: SpotifySearchPlaylist };

function SpotifyChip() {
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
      style={{ background: PLATFORM_COLORS.spotify }}
    >
      Spotify
    </span>
  );
}

function SpotifyRow({
  item,
  highlighted,
  onHover,
  onActivate,
}: {
  item: FlatItem;
  highlighted: boolean;
  onHover: () => void;
  onActivate: () => void;
}) {
  const t = useT();
  const rowClass = `flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 cursor-pointer ${
    highlighted ? "bg-hover" : ""
  }`;
  const coverClass =
    "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-base";

  if (item.kind === "track") {
    const tr = item.track;
    return (
      <li>
        <div onClick={onActivate} onMouseEnter={onHover} className={rowClass}>
          <span className={coverClass}>
            {tr.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tr.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Music2 size={14} className="text-ink-muted" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">
              {tr.title}
            </span>
            <span className="block truncate text-[12px] text-ink-soft">
              {tr.artists} · {tr.album}
            </span>
          </span>
          {tr.popularity !== undefined && (
            <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">
              ♬ {tr.popularity}
            </span>
          )}
          {tr.durationMs !== undefined && (
            <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">
              {formatDuration(tr.durationMs)}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onActivate();
            }}
            aria-label={fmt(t.search.playAria, { title: tr.title })}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:bg-accent-hover ${
              highlighted ? "opacity-100" : "opacity-0"
            }`}
          >
            <Play size={13} fill="currentColor" />
          </button>
        </div>
      </li>
    );
  }

  if (item.kind === "album") {
    const a = item.album;
    return (
      <li>
        <div onClick={onActivate} onMouseEnter={onHover} className={rowClass}>
          <span className={coverClass}>
            {a.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Disc size={14} className="text-ink-muted" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">
              {a.name}
            </span>
            <span className="block truncate text-[12px] text-ink-soft">
              {a.artist}
              {a.trackCount !== undefined ? fmt(t.urlInput.tracksSuffix, { n: a.trackCount }) : ""}
              {a.releaseDate ? ` · ${a.releaseDate.slice(0, 4)}` : ""}
            </span>
          </span>
        </div>
      </li>
    );
  }

  if (item.kind === "artist") {
    const a = item.artist;
    return (
      <li>
        <div onClick={onActivate} onMouseEnter={onHover} className={rowClass}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-base">
            {a.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Mic size={14} className="text-ink-muted" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">
              {a.name}
            </span>
            <span className="block truncate text-[12px] text-ink-soft">
              {t.search.artist}
              {a.followers !== undefined ? fmt(t.urlInput.followersSuffix, { n: formatFollowers(a.followers) }) : ""}
            </span>
          </span>
        </div>
      </li>
    );
  }

  const p = item.playlist;
  return (
    <li>
      <div onClick={onActivate} onMouseEnter={onHover} className={rowClass}>
        <span className={coverClass}>
          {p.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 size={14} className="text-ink-muted" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {p.name}
          </span>
          <span className="block truncate text-[12px] text-ink-soft">
            {fmt(t.common.byArtist, { owner: p.owner })}
            {p.trackCount !== undefined ? fmt(t.urlInput.tracksSuffix, { n: p.trackCount }) : ""}
          </span>
        </span>
      </div>
    </li>
  );
}

function SpotifyResultsDropdown({
  groups,
  highlight,
  onHighlight,
  onActivate,
}: {
  groups: SpotifySearchResult;
  highlight: number;
  onHighlight: (i: number) => void;
  onActivate: (item: FlatItem) => void;
}) {
  const t = useT();
  const sections: Array<{
    key: string;
    label: string;
    icon: ReactNode;
    items: FlatItem[];
  }> = [
    {
      key: "tracks",
      label: t.urlInput.sectionsTracks,
      icon: <Music2 size={13} />,
      items: groups.tracks.map((track) => ({ kind: "track", track }) as FlatItem),
    },
    {
      key: "albums",
      label: t.urlInput.sectionsAlbums,
      icon: <Disc size={13} />,
      items: groups.albums.map((album) => ({ kind: "album", album }) as FlatItem),
    },
    {
      key: "artists",
      label: t.urlInput.sectionsArtists,
      icon: <Mic size={13} />,
      items: groups.artists.map((artist) => ({ kind: "artist", artist }) as FlatItem),
    },
    {
      key: "playlists",
      label: t.urlInput.sectionsPlaylists,
      icon: <Music2 size={13} />,
      items: groups.playlists.map((playlist) => ({
        kind: "playlist",
        playlist,
      }) as FlatItem),
    },
  ];

  let offset = 0;
  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-edge bg-card shadow-xl animate-rise-in">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {t.urlInput.results}
        </p>
        <SpotifyChip />
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        {sections.map((section) => {
          if (section.items.length === 0) return null;
          const start = offset;
          offset += section.items.length;
          return (
            <div key={section.key}>
              <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {section.icon}
                {section.label}
              </p>
              <ul>
                {section.items.map((item, i) => (
                  <SpotifyRow
                    key={`${section.key}-${i}`}
                    item={item}
                    highlighted={highlight === start + i}
                    onHover={() => onHighlight(start + i)}
                    onActivate={() => onActivate(item)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UrlInput() {
  const playTrack = usePlayer((s) => s.playTrack);
  const push = useToasts((s) => s.push);
  const t = useT();
  const router = useRouter();
  const setStoreQuery = useSearchStore((s) => s.setQuery);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [spGroups, setSpGroups] = useState<SpotifySearchResult | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [menuResult, setMenuResult] = useState<SearchResult | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const detected = detectLink(value);
  const badgePlatform: Platform | null = detected?.platform ?? null;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleChange(next: string) {
    setValue(next);
    setStoreQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (detectLink(next) || next.trim().length < 2) {
      setResults([]);
      setSpGroups(null);
      setOpen(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void fetchSearch(next.trim()).finally(() => setSearching(false));
    }, 400);
  }

  /** Recherche Spotify-first, repli YouTube. Retourne true si affiché. */
  async function fetchSearch(query: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      if (data.source === "spotify") {
        const groups: SpotifySearchResult = {
          tracks: data.tracks ?? [],
          albums: data.albums ?? [],
          artists: data.artists ?? [],
          playlists: data.playlists ?? [],
        };
        const hasAny =
          groups.tracks.length +
            groups.albums.length +
            groups.artists.length +
            groups.playlists.length >
          0;
        setSpGroups(groups);
        setResults([]);
        setHighlight(0);
        setOpen(hasAny);
        return hasAny;
      }
      setSpGroups(null);
      setResults(data.results ?? []);
      setHighlight(0);
      setOpen((data.results ?? []).length > 0);
      return (data.results ?? []).length > 0;
    } catch {
      setSpGroups(null);
      setResults([]);
      setOpen(false);
      return false;
    }
  }

  function clearSearch() {
    setValue(""); setStoreQuery("");
    setResults([]);
    setSpGroups(null);
  }

  function playResult(result: SearchResult): Track {
    return searchResultToTrack(result);
  }

  // Synchronisation store → input (frappe depuis la page /search) :
  // setState dans le callback d'abonnement (système externe), pas dans le
  // corps de l'effet — motif recommandé par React.
  useEffect(() => {
    const unsub = useSearchStore.subscribe((state, prev) => {
      if (state.query === prev.query) return;
      setValue((v) => (state.query !== v ? state.query : v));
    });
    return unsub;
  }, []);

  async function handlePlay(result: SearchResult) {
    setOpen(false);
    const track = playResult(result);
    await playTrack(track, [track]);
    push(fmt(t.search.playTitle, { title: track.title }), "success");
    setValue(""); setStoreQuery("");
    setResults([]);
  }

  function handleDetails(result: SearchResult) {
    setOpen(false);
    const track = playResult(result);
    router.push(`/song/${encodeURIComponent(track.id)}`);
    setValue(""); setStoreQuery("");
    setResults([]);
  }

  /** Liste plate des items Spotify (navigation clavier). */
  function flatItems(): FlatItem[] {
    if (!spGroups) return [];
    return [
      ...spGroups.tracks.map((track) => ({ kind: "track" as const, track })),
      ...spGroups.albums.map((album) => ({ kind: "album" as const, album })),
      ...spGroups.artists.map((artist) => ({ kind: "artist" as const, artist })),
      ...spGroups.playlists.map((playlist) => ({
        kind: "playlist" as const,
        playlist,
      })),
    ];
  }

  function goImport(id: string, type: "album" | "playlist") {
    setOpen(false);
    clearSearch();
    router.push(`/import/spotify/${id}?type=${type}`);
  }

  function activateFlat(item: FlatItem) {
    if (item.kind === "track") {
      void handleSpotifyTrack(item.track);
    } else if (item.kind === "album") {
      goImport(item.album.id, "album");
    } else if (item.kind === "playlist") {
      goImport(item.playlist.id, "playlist");
    } else {
      setOpen(false);
      clearSearch();
      router.push(`/artist/spotify/${item.artist.id}`);
    }
  }

  async function handleSpotifyTrack(stk: SpotifySearchTrack) {
    setOpen(false);
    setSearching(true);
    try {
      const res = await fetch("/api/resolve-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "spotify",
          trackId: stk.spotifyId,
          isrc: stk.isrc,
          title: stk.title,
          artist: stk.artists,
          durationMs: stk.durationMs,
          album: stk.album,
          coverUrl: stk.coverUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const track = data.track as Track;
      await playTrack(track, [track]);
      push(fmt(t.search.playTitle, { title: track.title }), "success");
    } catch {
      push(t.common.unreadableTitle, "error");
    } finally {
      setSearching(false);
    }
    clearSearch();
  }

  async function resolveUrl(url: string): Promise<{ ok: boolean; data?: { kind: string; collectionTitle?: string; tracks: Track[] }; error?: string }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error ?? t.common.unreadableLink };
        return { ok: true, data };
      } catch {
        if (attempt === 1) return { ok: false, error: t.urlInput.serverUnreachable };
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    return { ok: false, error: t.common.networkError };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading || searching) return;

    if (!detected) {
      const flat = flatItems();
      if (flat.length > 0) {
        activateFlat(flat[highlight % flat.length]);
        return;
      }
      if (results.length > 0) {
        await handlePlay(results[highlight]);
        return;
      }
      setSearching(true);
      try {
        await fetchSearch(value.trim());
      } catch {
        push(t.search.searchUnavailable, "error");
      } finally {
        setSearching(false);
      }
      return;
    }

    setLoading(true);
    try {
      const result = await resolveUrl(value.trim());
      if (!result.ok || !result.data) {
        push(result.error ?? t.common.unreadableLink, "error");
        return;
      }

      const tracks = result.data.tracks;
      await playTrack(tracks[0], tracks);
      push(
        result.data.kind === "track" || result.data.kind === "direct"
          ? fmt(t.search.playTitle, { title: tracks[0].title })
          : fmt(t.search.collectionAdded, { title: result.data.collectionTitle ?? "" }),
        "success"
      );
      setValue(""); setStoreQuery("");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = spGroups ? flatItems().length : results.length;
    if (!open || total === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + total) % total);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Link2
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="resonance-url-input"
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0 || flatItems().length > 0) setOpen(true);
            }}
            placeholder={t.urlInput.pastePlaceholder}
            className="w-full h-9 rounded-card border border-edge bg-base pl-9 pr-24 text-[13px] text-white placeholder:text-ink-muted outline-none transition-colors duration-150 focus:border-accent"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {badgePlatform ? (
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                style={{ background: PLATFORM_COLORS[badgePlatform] }}
              >
                {PLATFORM_LABELS[badgePlatform]}
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-card text-ink-soft border border-edge">
                {t.urlInput.autoDetect}
              </span>
            )}
          </div>
          {(loading || searching) && (
            <Loader2
              size={15}
              className="absolute right-[92px] top-1/2 -translate-y-1/2 animate-spin text-accent"
            />
          )}
        </div>
      </form>

      {open && spGroups && (
        <SpotifyResultsDropdown
          groups={spGroups}
          highlight={highlight}
          onHighlight={setHighlight}
          onActivate={activateFlat}
        />
      )}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-edge bg-card shadow-xl animate-rise-in">
          <p className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t.urlInput.youtubeResults}
          </p>
          <ul className="max-h-[340px] overflow-y-auto">
            {results.map((r, i) => (
              <li key={r.videoId}>
                <div
                  onClick={() => handleDetails(r)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 cursor-pointer ${
                    i === highlight ? "bg-hover" : ""
                  }`}
                >
                  <span className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-base">
                    {r.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Music2 size={14} className="text-ink-muted" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {r.title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-soft">
                      {r.channel}
                    </span>
                  </span>
                  {r.durationMs && (
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">
                      {formatDuration(r.durationMs)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePlay(r);
                    }}
                    aria-label={fmt(t.search.playAria, { title: r.title })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white opacity-0 transition-opacity hover:bg-accent-hover group-hover/list:opacity-100 data-[hl=true]:opacity-100"
                    data-hl={i === highlight}
                  >
                    <Play size={13} fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuResult(r);
                      setMenuAnchor(anchorFromEvent(e));
                    }}
                    aria-label={fmt(t.search.optionsAria, { title: r.title })}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted opacity-0 transition-opacity hover:bg-hover hover:text-white group-hover/list:opacity-100 data-[hl=true]:opacity-100"
                    data-hl={i === highlight}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {menuResult && (
        <TrackMenu
          track={playResult(menuResult)}
          anchor={menuAnchor}
          onClose={() => {
            setMenuAnchor(null);
            setMenuResult(null);
          }}
          actions={{
            onPlay: () => void handlePlay(menuResult),
            playLabel: t.search.playLabel,
            onPlayNext: () => {
              const track = playResult(menuResult);
              void smartPlayNext(track).then((result) =>
                toastQueueResult(push, result, track.title)
              );
            },
            onAddToQueue: () => {
              const track = playResult(menuResult);
              void smartAddToQueue(track).then((result) => {
                usePlayer.getState().setQueueOpen(true);
                toastQueueResult(push, result, track.title);
              });
            },
          }}
        />
      )}
    </div>
  );
}
