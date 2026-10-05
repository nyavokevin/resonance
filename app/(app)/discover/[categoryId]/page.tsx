import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ListMusic } from "lucide-react";
import {
  fetchSpotifyPlaylistTracks,
  getBrowseCategory,
  getCategoryPlaylists,
  searchSpotify,
} from "@/lib/providers/spotify-api";
import type { SpotifySearchTrack } from "@/lib/providers/spotify-api";
import { searchYouTube } from "@/lib/providers/search";
import type { SearchResult } from "@/lib/providers/search";
import { GenreTrackList } from "@/components/GenreTrackList";
import { getServerDictionary } from "@/lib/i18n/server";
import { fmt, plural } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

const MAX_GENRE_TRACKS = 24;
/** Viviers larges : on mélange puis on tranche à MAX_GENRE_TRACKS. */
const SEARCH_POOL = 50;
const PLAYLIST_POOL = 50;
const PLAYLIST_SOURCES = 5;

/**
 * Fisher-Yates sur une copie : ordre neuf à chaque requête. Les caches
 * (searchSpotify 5min, browse 15min) stockent l'ordre brut ; le mélange
 * a lieu APRÈS lecture du cache, donc jamais figé.
 */
function shuffled<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = arr[i] as T;
    const b = arr[j] as T;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

/**
 * Catégories éditoriales : `genre:<id>` n'a aucun sens pour elles
 * ("Top Lists", "Made For You", "Mood"…), on saute l'étape (b).
 * Un `genre:` inconnu renvoie juste 0 résultats, donc la liste reste
 * volontairement courte — le pire cas est un appel API vide en cache.
 */
const EDITORIAL_CATEGORY_IDS = new Set([
  "toplists",
  "made_for_you",
  "madeforyou",
  "mood",
  "party",
  "chill",
  "sleep",
  "focus",
  "workout",
  "dinner",
  "gaming",
  "decades",
  "romance",
  "pride",
  "equal",
  "fresh_finds",
  "radar",
  "discover",
  "newmusicfriday",
  "at_home",
  "wellness",
  "family",
  "kids",
  "travel",
  "charts",
  "viral",
  "seasons",
]);

function isEditorialCategory(id: string): boolean {
  return EDITORIAL_CATEGORY_IDS.has(id.toLowerCase());
}

type GenreTrackSource =
  | "search"
  | "genre"
  | "query"
  | "playlists"
  | "youtube"
  | "empty";

export interface GenreTracks {
  tracks: SpotifySearchTrack[];
  /** Dernier recours (panne Spotify totale) : résultats YouTube bruts. */
  youtubeTracks: SearchResult[];
  source: GenreTrackSource;
}

/**
 * Chaîne de repli résiliente pour les titres d'un genre :
 * a. recherche par nom de catégorie (ex. "Rock") ;
 * b. `genre:<categoryId>` puis categoryId brut (sauf éditorial) ;
 * c. titres des 5 premières playlists, dédupliqués (vivier ~50) ;
 * d. YouTube (`<nom> top hits` + `<nom> music` fusionnés), dernier recours
 *    quand Spotify est totalement indisponible (ex. /discover/pop
 *    sans token : ni recherche ni playlists ne renvoient rien).
 * Hasard : chaque étape tire un large vivier puis mélange (Fisher-Yates)
 * et tranche à MAX_GENRE_TRACKS — l'ordre varie à chaque chargement.
 * Chaque étape a son propre try/catch : la page ne casse jamais.
 */
async function resolveGenreTracks(
  categoryId: string,
  categoryName: string,
  playlistIds: string[]
): Promise<GenreTracks> {
  // a. Primaire : nom de la catégorie (vivier large + mélange).
  try {
    const primary = await searchSpotify(categoryName || categoryId, ["track"], SEARCH_POOL);
    if (primary && primary.tracks.length > 0) {
      return {
        tracks: shuffled(primary.tracks).slice(0, MAX_GENRE_TRACKS),
        youtubeTracks: [],
        source: "search",
      };
    }
    console.warn(
      `[discover/${categoryId}] primary search empty for "${categoryName}"`
    );
  } catch {
    console.warn(`[discover/${categoryId}] primary search failed`);
  }

  // b. Replis par ID (ignorés pour les catégories éditoriales).
  if (!isEditorialCategory(categoryId)) {
    const genreToken = categoryId.toLowerCase().replace(/_/g, "-");
    try {
      const byGenre = await searchSpotify(`genre:${genreToken}`, ["track"], SEARCH_POOL);
      if (byGenre && byGenre.tracks.length > 0) {
        console.warn(
          `[discover/${categoryId}] fallback "genre:${genreToken}" hit (${byGenre.tracks.length})`
        );
        return {
          tracks: shuffled(byGenre.tracks).slice(0, MAX_GENRE_TRACKS),
          youtubeTracks: [],
          source: "genre",
        };
      }
      console.warn(`[discover/${categoryId}] genre: query empty`);
    } catch {
      console.warn(`[discover/${categoryId}] genre: query failed`);
    }
    if (categoryId.toLowerCase() !== categoryName.toLowerCase()) {
      try {
        const byId = await searchSpotify(categoryId, ["track"], SEARCH_POOL);
        if (byId && byId.tracks.length > 0) {
          console.warn(
            `[discover/${categoryId}] fallback id query hit (${byId.tracks.length})`
          );
          return {
            tracks: shuffled(byId.tracks).slice(0, MAX_GENRE_TRACKS),
            youtubeTracks: [],
            source: "query",
          };
        }
        console.warn(`[discover/${categoryId}] id query empty`);
      } catch {
        console.warn(`[discover/${categoryId}] id query failed`);
      }
    }
  }

  // c. Titres issus des playlists de la catégorie (top 5, dédupliqués,
  //    vivier large mélangé : l'ordre varie à chaque chargement).
  // SpotifyApiTrack est assignable à SpotifySearchTrack (popularity optionnel).
  try {
    const seen = new Set<string>();
    const pool: SpotifySearchTrack[] = [];
    for (const pid of playlistIds.slice(0, PLAYLIST_SOURCES)) {
      if (pool.length >= PLAYLIST_POOL) break;
      const data = await fetchSpotifyPlaylistTracks(pid).catch(() => null);
      for (const item of data?.items ?? []) {
        if (seen.has(item.spotifyId)) continue;
        seen.add(item.spotifyId);
        pool.push(item);
        if (pool.length >= PLAYLIST_POOL) break;
      }
    }
    if (pool.length > 0) {
      const picked = shuffled(pool).slice(0, MAX_GENRE_TRACKS);
      console.warn(
        `[discover/${categoryId}] fallback to playlist tracks (${picked.length}/${pool.length})`
      );
      return { tracks: picked, youtubeTracks: [], source: "playlists" };
    }
  } catch {
    console.warn(`[discover/${categoryId}] playlist tracks fallback failed`);
  }

  // d. Dernier recours : YouTube server-side (même helper que /api/search).
  // Les deux requêtes sont fusionnées puis mélangées (hasard à chaque reload).
  try {
    const seenYt = new Set<string>();
    const pool: SearchResult[] = [];
    for (const q of [`${categoryName} top hits`, `${categoryName} music`]) {
      const results = await searchYouTube(q).catch(() => []);
      for (const r of results) {
        if (!r.videoId || seenYt.has(r.videoId)) continue;
        seenYt.add(r.videoId);
        pool.push(r);
      }
    }
    if (pool.length > 0) {
      const picked = shuffled(pool).slice(0, MAX_GENRE_TRACKS);
      console.warn(
        `[discover/${categoryId}] fallback to youtube (${picked.length}/${pool.length})`
      );
      return { tracks: [], youtubeTracks: picked, source: "youtube" };
    }
    console.warn(`[discover/${categoryId}] youtube fallback empty`);
  } catch {
    console.warn(`[discover/${categoryId}] youtube fallback failed`);
  }

  console.warn(`[discover/${categoryId}] all track sources empty`);
  return { tracks: [], youtubeTracks: [], source: "empty" };
}

export default async function DiscoverCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { t } = await getServerDictionary();
  const { categoryId } = await params;
  // La recherche de titres a besoin du nom de la catégorie : on la
  // récupère d'abord (avec repli sur la liste). Les playlists sont
  // chargées ensuite car l'étape (c) de resolveGenreTracks en dépend.
  const category = await getBrowseCategory(categoryId).catch(() => null);
  if (!category) notFound();

  const playlists = await getCategoryPlaylists(categoryId, 20).catch(() => []);
  const { tracks, youtubeTracks } = await resolveGenreTracks(
    categoryId,
    category.name,
    playlists.map((p) => p.id)
  );

  return (
    <div className="pt-2 pb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Link href="/discover" className="hover:text-white transition-colors">
          {t.discover.breadcrumb}
        </Link>
        <ChevronRight size={13} />
        <span className="text-ink-soft">{category.name}</span>
      </nav>

      {/* Header */}
      <header className="mt-3 flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card bg-card border border-edge">
          {category.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ListMusic size={26} className="text-ink-muted" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t.discover.categorySpotify}
          </p>
          <h1 className="mt-0.5 truncate font-display text-[26px] font-bold text-white">
            {category.name}
          </h1>
          <p className="text-[12px] text-ink-muted">
            {fmt(t.discover.publicPlaylists, {
              n: playlists.length,
              s: plural(playlists.length),
            })}
          </p>
        </div>
      </header>

      {/* Top titres du genre (Spotify + repli YouTube) — jouables au clic */}
      <GenreTrackList
        tracks={tracks}
        youtubeTracks={youtubeTracks}
        genreName={category.name}
        hasPlaylists={playlists.length > 0}
      />

      {/* Grille playlists du genre */}
      <section className="mt-6 space-y-3">
        <h2 className="font-display text-[16px] font-semibold text-white tracking-tight">
          {t.discover.playlistsTitle}
        </h2>
        {playlists.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            {t.discover.noPlaylists}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {playlists.map((p) => (
              <Link
                key={p.id}
                href={`/import/spotify/${p.id}?type=playlist`}
                className="group rounded-card bg-card hover:bg-hover border border-edge p-3 transition-colors"
              >
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-base">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ListMusic size={24} className="text-ink-muted" />
                  )}
                </span>
                <span className="mt-2 block truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                  {p.name}
                </span>
                {p.description && (
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-soft">
                    {p.description}
                  </span>
                )}
                <span className="mt-1 block truncate text-[11px] text-ink-muted">
                  {p.owner}
                  {p.trackCount ? fmt(t.discover.tracksSuffix, { n: p.trackCount }) : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
