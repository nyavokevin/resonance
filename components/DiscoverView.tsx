"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Moon, Dumbbell, CloudRain, PartyPopper, BookOpen, Plus, RefreshCw, Loader2, Play, Music2, Sparkles, Disc } from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, toastQueueResult } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import { formatDuration } from "@/components/TrackList";
import { PLATFORM_COLORS, type Track } from "@/lib/types";
import type {
  SpotifyCategory,
  SpotifyCategoryPlaylist,
  SpotifyNewRelease,
} from "@/lib/providers/spotify-api";
import { useT } from "@/lib/i18n/locale-store";
import { fmt, plural, type Dictionary } from "@/lib/i18n/dictionaries";

/* Tuiles catégories : palette sombre discord-compatible, couleur
 * dérivée du nom (stable entre les visites). */
const TILE_COLORS = [
  "#4A3A6A",
  "#3A5A6A",
  "#6A3A4A",
  "#3A6A4E",
  "#6A5A3A",
  "#3E4A6B",
  "#6B3E5A",
  "#2F5D50",
];

function tileColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

const EMOJI_FALLBACK = ["🎸", "🎧", "🎷", "🎹", "🎤", "🥁", "🎻", "🎺"];

function fallbackEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (/rock|metal|punk/.test(lower)) return "🎸";
  if (/hip|rap|rb|r&b|urban/.test(lower)) return "🎤";
  if (/electro|dance|house|techno|edm|club/.test(lower)) return "🎧";
  if (/jazz|blues|soul|funk/.test(lower)) return "🎷";
  if (/classiq|orchestre|piano/.test(lower)) return "🎻";
  if (/latin|reggaeton|salsa/.test(lower)) return "💃";
  if (/podcast|talk/.test(lower)) return "🎙️";
  if (/pop/.test(lower)) return "⭐";
  if (/chill|ambient|sleep|relax/.test(lower)) return "🌙";
  if (/party|fiesta|fête/.test(lower)) return "🎉";
  if (/country|folk/.test(lower)) return "🤠";
  if (/mood|feel|made for|pour toi/.test(lower)) return "✨";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return EMOJI_FALLBACK[hash % EMOJI_FALLBACK.length];
}

function CategoryTile({ category }: { category: SpotifyCategory }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/discover/${category.id}`)}
      className="group relative h-24 overflow-hidden rounded-card p-3.5 text-left text-white font-display text-[15px] font-bold transition-transform duration-150 hover:scale-[1.03] hover:shadow-[0_0_16px_rgba(88,101,242,0.35)]"
      style={{ background: tileColor(category.name) }}
    >
      <span className="relative z-10 line-clamp-2 leading-tight">{category.name}</span>
      {category.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={category.iconUrl}
          alt=""
          loading="lazy"
          className="absolute -bottom-2 right-0 h-16 w-16 rotate-[25deg] rounded-[6px] object-cover shadow-lg"
        />
      ) : (
        <span className="absolute -bottom-3 right-1 rotate-[25deg] text-[56px] leading-none opacity-90">
          {fallbackEmoji(category.name)}
        </span>
      )}
    </button>
  );
}

const sectionTitle = "font-display text-[16px] font-semibold text-white tracking-tight";

function contextualGreeting(hour: number, t: Dictionary): { title: string; subtitle: string } {
  if (hour < 6) return { title: t.discover.title, subtitle: t.discover.subtitleNight };
  if (hour < 12) return { title: t.discover.title, subtitle: t.discover.subtitleMorning };
  if (hour < 18) return { title: t.discover.title, subtitle: t.discover.subtitleAfternoon };
  if (hour < 22) return { title: t.discover.title, subtitle: t.discover.subtitleEvening };
  return { title: t.discover.title, subtitle: t.discover.subtitleNight };
}

export function DiscoverView({
  recent,
  topArtists,
  globalTrending,
  forgotten,
  categories,
  featured,
  newReleases,
}: {
  recent: Track[];
  topArtists: string[];
  globalTrending: Track[];
  forgotten: Track[];
  categories: SpotifyCategory[];
  featured: SpotifyCategoryPlaylist[];
  newReleases: SpotifyNewRelease[];
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const playTrack = usePlayer((s) => s.playTrack);
  const [busyMix, setBusyMix] = useState<string | null>(null);
  const [radioTracks, setRadioTracks] = useState<Track[] | null>(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hour = new Date().getHours();
  const { title: heroTitle, subtitle: heroSubtitle } = contextualGreeting(hour, t);
  const lastTrack = recent[0];
  const hasHistory = topArtists.length > 0;

  const moods = [
    { name: t.discover.moodsEnergy, query: "workout energy hits", icon: Flame, color: "#E8843C" },
    { name: t.discover.moodsChill, query: "chill ambient relax", icon: Moon, color: "#5865F2" },
    { name: t.discover.moodsSport, query: "sport motivation", icon: Dumbbell, color: "#D14343" },
    { name: t.discover.moodsMelancholy, query: "melancholic sad songs", icon: CloudRain, color: "#80848E" },
    { name: t.discover.moodsParty, query: "party dance hits", icon: PartyPopper, color: "#E8618C" },
    { name: t.discover.moodsFocus, query: "focus deep work", icon: BookOpen, color: "#23A55A" },
  ];

  const genreMixes = categories.slice(0, 6);

  /** Taille d'un mix + vivier de candidats (les échecs de resolve sont compensés). */
  const MIX_COUNT = 30;
  const MIX_POOL = 50;

  type MixCandidate = {
    platform: "spotify";
    trackId?: string;
    isrc?: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    durationMs?: number;
  };

  /** Resolve un candidat : strict (spotifyId + ISRC) puis repli texte seul. */
  async function resolveCandidate(c: MixCandidate): Promise<Track | null> {
    // Le chemin strict enchaîne 3 appels externes (Spotify, iTunes, scrape
    // YouTube) et peut timeout ; le repli titre+artiste seul est léger et
    // force le match texte pur côté serveur.
    const attempts: MixCandidate[] =
      c.trackId || c.isrc
        ? [c, { platform: "spotify", title: c.title, artist: c.artist, durationMs: c.durationMs }]
        : [c];
    for (const body of attempts) {
      try {
        const r = await fetch("/api/resolve-track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (r.ok && d.track) return d.track as Track;
      } catch {
        // Essai suivant.
      }
    }
    return null;
  }

  /** Construit un mix : large vivier Spotify → resolve jusqu'à `count` → top-up YouTube multi-requêtes. */
  async function buildMix(label: string, query: string, count = MIX_COUNT): Promise<Track[] | null> {
    setBusyMix(label);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&type=track&limit=${MIX_POOL}`
      );
      const data = await res.json();
      const spotifyTracks = (data.source === "spotify" ? (data.tracks ?? []) : []) as Array<{
        title: string;
        artists: string;
        spotifyId: string;
        isrc?: string;
        album?: string;
        coverUrl?: string;
        durationMs?: number;
      }>;
      // Déduplique titre+artiste en gardant l'ordre de pertinence.
      const seenQuery = new Set<string>();
      const candidates: MixCandidate[] = [];
      for (const t of spotifyTracks) {
        const key = `${t.title} — ${t.artists}`.toLowerCase();
        if (seenQuery.has(key)) continue;
        seenQuery.add(key);
        candidates.push({
          platform: "spotify" as const,
          trackId: t.spotifyId,
          isrc: t.isrc,
          title: t.title,
          artist: t.artists,
          album: t.album,
          coverUrl: t.coverUrl,
          durationMs: t.durationMs,
        });
      }
      // Parcourt le vivier par batchs de 3 jusqu'à `count` succès : un
      // échec isolé ne réduit plus le mix, il consomme juste un candidat.
      const resolved: Track[] = [];
      const seenIds = new Set<string>();
      for (let i = 0; i < candidates.length && resolved.length < count; i += 3) {
        const batch = candidates.slice(i, i + 3);
        const results = await Promise.all(batch.map((c) => resolveCandidate(c)));
        for (const t of results) {
          if (t && !seenIds.has(t.id) && resolved.length < count) {
            seenIds.add(t.id);
            resolved.push(t);
          }
        }
      }
      if (resolved.length < count) {
        // Dernier recours : complète avec du YouTube direct (mapping jouable,
        // même forme que /api/search?source=youtube) jusqu'à `count`.
        // Une seule requête YouTube plafonne à ~12 résultats (slice côté
        // searchYouTube) : on enchaîne 4 variantes et on fusionne en
        // dédupliquant par videoId — le top-up peut fournir 30 titres seul.
        // Même pattern que resolveGenreTracks (étape d), en plus large.
        try {
          const seenYt = new Set<string>();
          const ytQueries = [
            `${query} top hits`,
            `${query} classics`,
            `${query} music`,
            query,
          ];
          for (const q of ytQueries) {
            if (resolved.length >= count) break;
            let yt: Array<{
              videoId: string;
              title: string;
              channel: string;
              thumbnail?: string;
              durationMs?: number;
            }> = [];
            try {
              const ytRes = await fetch(
                `/api/search?q=${encodeURIComponent(q)}&source=youtube`
              );
              const ytData = await ytRes.json();
              yt = (ytData.results ?? []) as typeof yt;
            } catch {
              continue;
            }
            for (const r of yt) {
              if (resolved.length >= count) break;
              if (!r.videoId || seenYt.has(r.videoId)) continue;
              seenYt.add(r.videoId);
              const t = searchResultToTrackSafe(r);
              if (seenIds.has(t.id)) continue;
              seenIds.add(t.id);
              resolved.push(t);
            }
          }
        } catch {
          // On garde les titres déjà résolus.
        }
      }
      return resolved.length > 0 ? resolved : null;
    } catch {
      push(t.discover.mixUnavailable, "error");
      return null;
    } finally {
      setBusyMix(null);
    }
  }

  function searchResultToTrackSafe(r: { videoId: string; title: string; channel: string; thumbnail?: string; durationMs?: number }): Track {
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

  async function playMix(label: string, query: string) {
    const tracks = await buildMix(label, query);
    if (!tracks?.length) return;
    await playTrack(tracks[0], tracks);
    const total = MIX_COUNT;
    const missing = total - tracks.length;
    push(
      missing > 0
        ? fmt(t.discover.mixResolved, { label, x: tracks.length, total, missing, s: plural(missing) })
        : fmt(t.discover.mixLaunched, { label, x: tracks.length, total }),
      missing > 0 ? "info" : "success"
    );
    router.refresh();
  }

  async function loadRadioRail() {
    if (radioLoading || radioTracks) return;
    setRadioLoading(true);
    try {
      const last = lastTrack;
      let tracks: Track[] = [];
      if (last?.platformTrackId && (last.platform === "youtube" || last.platform === "youtube-music")) {
        const res = await fetch(`/api/radio?videoId=${encodeURIComponent(last.platformTrackId)}`);
        const data = await res.json();
        tracks = (data.tracks ?? []) as Track[];
      } else if (last) {
        const res = await fetch(`/api/search?q=${encodeURIComponent(`${last.title} ${last.artist}`)}`);
        const data = await res.json();
        const yt = (data.results ?? []) as Array<{ videoId: string; title: string; channel: string; thumbnail?: string; durationMs?: number }>;
        tracks = yt.slice(0, 10).map(searchResultToTrackSafe).map((t) => ({ ...t, auto: true }));
      }
      setRadioTracks(tracks.slice(0, 10));
    } catch {
      push(t.discover.suggestionsUnavailable, "info");
      setRadioTracks([]);
    } finally {
      setRadioLoading(false);
    }
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch("/api/browse-refresh", { method: "POST" }).catch(() => null);
    } finally {
      setRefreshing(false);
      router.refresh();
    }
  }

  return (
    <div className="pt-2 space-y-8 pb-6">
      {/* Hero */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-bold text-white tracking-tight">
            ✨ {heroTitle}
          </h1>
          <p className="text-ink-soft text-[13px] mt-0.5">{heroSubtitle}</p>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-card bg-panel border border-edge text-ink-soft hover:text-white hover:bg-hover text-[12px] font-medium transition-colors w-fit disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {t.discover.refresh}
        </button>
      </section>

      {/* Grille des catégories (cœur de la page) — jamais vide :
          la page fournit les genres statiques de secours si Spotify échoue. */}
      <section className="space-y-3">
        <h2 className={sectionTitle}>{t.discover.exploreByGenre}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {categories.map((c) => (
            <CategoryTile key={c.id} category={c} />
          ))}
        </div>
      </section>

      {/* Sélection du moment (featured-playlists) */}
      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className={sectionTitle}>{t.discover.pickOfMoment}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {featured.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/import/spotify/${p.id}?type=playlist`)}
                className="group w-[200px] shrink-0 rounded-card bg-card hover:bg-hover border border-edge p-3 cursor-pointer transition-colors"
              >
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-base">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Music2 size={24} className="text-ink-muted" />
                  )}
                </span>
                <p className="mt-2 truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                  {p.name}
                </p>
                <p className="truncate text-[11px] text-ink-muted">
                  {p.owner}
                  {p.trackCount ? fmt(t.discover.tracksSuffix, { n: p.trackCount }) : ""}
                </p>
                <span className="mt-1.5 inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-ok/15 text-ok border border-ok/30">
                  Spotify
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nouveautés albums (new-releases) */}
      {newReleases.length > 0 && (
        <section className="space-y-3">
          <h2 className={sectionTitle}>{t.discover.newAlbums}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {newReleases.map((a) => (
              <div
                key={a.id}
                onClick={() => router.push(`/import/spotify/${a.id}?type=album`)}
                className="group w-[160px] shrink-0 rounded-card bg-card hover:bg-hover border border-edge p-3 cursor-pointer transition-colors"
              >
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-base">
                  {a.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Disc size={24} className="text-ink-muted" />
                  )}
                </span>
                <p className="mt-2 truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                  {a.name}
                </p>
                <p className="truncate text-[11px] text-ink-muted">{a.artist}</p>
                {a.releaseDate && (
                  <p className="text-[11px] text-ink-muted">{a.releaseDate.slice(0, 4)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mix par genre (6 catégories les plus populaires) */}
      {genreMixes.length > 0 && (
        <section className="space-y-3">
          <h2 className={sectionTitle}>{t.discover.mixByGenre}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {genreMixes.map((c) => {
              const mixLabel = fmt(t.discover.mixName, { name: c.name });
              return (
                <button
                  key={c.id}
                  onClick={() => void playMix(mixLabel, c.name)}
                  disabled={busyMix !== null}
                  className="group relative overflow-hidden rounded-card p-4 text-left text-white transition-transform duration-150 hover:scale-[1.02] disabled:opacity-60"
                  style={{ background: tileColor(c.name) }}
                >
                  {c.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.iconUrl}
                      alt=""
                      loading="lazy"
                      className="absolute -bottom-2 right-0 h-16 w-16 rotate-[25deg] rounded-[6px] object-cover opacity-90"
                    />
                  ) : (
                    <span className="absolute -bottom-3 right-1 rotate-[25deg] text-[52px] leading-none opacity-80">
                      {fallbackEmoji(c.name)}
                    </span>
                  )}
                  <span className="relative z-10 flex items-center gap-2 font-display text-[15px] font-bold">
                    {busyMix === mixLabel ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                    {mixLabel}
                  </span>
                  <span className="relative z-10 mt-0.5 block text-[12px] text-white/70">
                    {t.discover.mixGenerated}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Made For You — parce que tu écoutes X, Y, Z… */}
      {hasHistory && lastTrack && (
        <section className="space-y-3" onMouseEnter={() => void loadRadioRail()}>
          <h2 className={sectionTitle}>
            {fmt(t.discover.becauseYouListen, { artists: topArtists.slice(0, 3).join(", ") })}
          </h2>
          {radioLoading && (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-[150px] h-[190px] rounded-card bg-card border border-edge animate-pulse" />
              ))}
            </div>
          )}
          {!radioLoading && radioTracks && radioTracks.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {radioTracks.map((rt) => (
                <div
                  key={rt.id}
                  onClick={() => {
                    void playTrack(rt, radioTracks).then(() => router.refresh());
                  }}
                  className="group w-[150px] shrink-0 rounded-card bg-card hover:bg-hover border border-edge p-2.5 cursor-pointer transition-colors"
                >
                  <div className="relative">
                    <span className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-base">
                      {rt.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rt.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Music2 size={20} className="text-ink-muted" />
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void smartAddToQueue(rt).then((r) => toastQueueResult(push, r, rt.title));
                      }}
                      aria-label={fmt(t.discover.addToQueueAria, { title: rt.title })}
                      className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent hover:bg-accent-hover text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="mt-2 truncate text-[12px] font-medium text-ink group-hover:text-accent transition-colors">
                    {rt.title}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {rt.artist}
                    {rt.auto ? " · AUTO" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tendances locales (données internes) */}
      {globalTrending.length > 0 && (
        <section className="space-y-3">
          <h2 className={sectionTitle}>{t.discover.localTrends}</h2>
          <div className="rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden">
            {globalTrending.map((track, i) => (
              <div
                key={track.id + ":" + i}
                onClick={() => {
                  void playTrack(track, globalTrending).then(() => router.refresh());
                }}
                className="flex items-center gap-4 px-3 py-2.5 hover:bg-hover transition-colors group cursor-pointer"
              >
                <span className="font-display text-[20px] font-bold text-ink-muted/60 w-8 text-center shrink-0 group-hover:text-accent transition-colors">
                  {i + 1}
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
                  <span className="block truncate text-[13px] font-semibold text-ink group-hover:text-accent transition-colors">
                    {track.title}
                  </span>
                  <span className="block truncate text-[12px] text-ink-soft">{track.artist}</span>
                </span>
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded text-white"
                  style={{ background: PLATFORM_COLORS[track.platform] ?? PLATFORM_COLORS.youtube }}
                >
                  {track.platform}
                </span>
                <span className="text-ink-muted text-[12px] font-mono shrink-0">
                  {formatDuration(track.durationMs)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Réécoute tes classiques */}
      {forgotten.length > 0 && (
        <section className="space-y-3">
          <h2 className={sectionTitle}>{t.discover.replayClassics}</h2>
          <p className="text-[12px] text-ink-muted">
            {t.discover.forgottenGems}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {forgotten.slice(0, 6).map((track) => (
              <div
                key={track.id}
                onClick={() => {
                  void playTrack(track, forgotten).then(() => router.refresh());
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
                  <span className="block truncate text-[12px] text-ink-muted">{track.artist}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ambiances */}
      <section className="space-y-3">
        <h2 className={sectionTitle}>{t.discover.vibes}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {moods.map((m) => (
            <button
              key={m.name}
              onClick={() => router.push(`/search?q=${encodeURIComponent(m.query)}`)}
              className="flex items-center gap-3 h-20 rounded-card p-4 text-left text-white font-display text-[15px] font-bold transition hover:brightness-110"
              style={{ background: m.color }}
            >
              <m.icon size={22} />
              {m.name}
            </button>
          ))}
        </div>
      </section>

      {!hasHistory && globalTrending.length === 0 && categories.length === 0 && (
        <div className="rounded-card border border-edge bg-card p-6 text-center">
          <Sparkles size={22} className="mx-auto text-accent" />
          <p className="mt-2 text-[13px] text-ink-soft">
            {t.discover.listenForSuggestions}
          </p>
        </div>
      )}
    </div>
  );
}
