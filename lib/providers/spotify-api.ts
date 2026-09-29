/**
 * Client Spotify Web API (server-only).
 *
 * Authentification "Client Credentials" : nécessite SPOTIFY_CLIENT_ID et
 * SPOTIFY_CLIENT_SECRET dans l'environnement (https://developer.spotify.com/dashboard).
 * Le token est mis en cache en mémoire jusqu'à expiration.
 * Sans credentials, les fonctions retournent null et l'appelant doit
 * retomber sur le scraping de la page embed.
 *
 * IMPORTANT : ne jamais importer ce module depuis un composant client,
 * les secrets y seraient exposés. L'import "server-only" ci-dessous
 * transforme toute violation en erreur de build.
 */
import "server-only";

export interface SpotifyApiTrack {
  spotifyId: string;
  title: string;
  artists: string;
  album: string;
  coverUrl?: string;
  durationMs?: number;
  isrc?: string;
  isPlayable: boolean;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

function hasCredentials(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
  );
}

/** Garde anti-fuite : aucun appel secret côté navigateur. */
function isServer(): boolean {
  return typeof window === "undefined";
}

const SPOTIFY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Marché Spotify (configurable, défaut FR). */
export const SPOTIFY_MARKET =
  process.env.NEXT_PUBLIC_MARKET?.trim().toUpperCase() || "FR";

/** Cache in-memory 5min (recherche surtout). */
const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { at: number; data: unknown }>();

function cacheGet<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function cacheSet(key: string, data: unknown): void {
  if (responseCache.size > 200) responseCache.clear();
  responseCache.set(key, { at: Date.now(), data });
}

/**
 * Fetch authentifié avec retry 429 (Retry-After, max 2 essais).
 * Jette une erreur si pas de token ou réponse non-OK.
 */
async function authedFetch(url: string, retries = 2): Promise<Response> {
  const token = await getSpotifyToken();
  if (!token) throw new Error("no Spotify token");
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": SPOTIFY_UA,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "2");
    const waitMs = Math.min(
      (Number.isFinite(retryAfter) ? retryAfter : 2) * 1000,
      8000
    );
    console.warn(`[spotify-api] 429, retry in ${waitMs}ms (${url.split("?")[0]})`);
    await new Promise((r) => setTimeout(r, waitMs));
    return authedFetch(url, retries - 1);
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  return res;
}

/** Helper authentifié : GET /v1/{path} + query, JSON parsé. */
export async function spotifyFetch<T = unknown>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const qs = new URLSearchParams({ market: SPOTIFY_MARKET, ...params }).toString();
  const res = await authedFetch(`https://api.spotify.com/v1/${path}?${qs}`);
  return (await res.json()) as T;
}

export async function getSpotifyToken(): Promise<string | null> {
  if (!isServer() || !hasCredentials()) {
    console.warn("[spotify-api] no credentials or not server");
    return null;
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  try {
    const basic = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": SPOTIFY_UA,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[spotify-api] token failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

interface SpotifyTrackObject {
  id?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: Array<{ url?: string }> };
  duration_ms?: number;
  external_ids?: { isrc?: string };
  is_playable?: boolean;
  type?: string;
}

function toApiTrack(
  t: SpotifyTrackObject,
  fallbackCover?: string
): SpotifyApiTrack | null {
  if (!t?.id || t.type === "episode") return null;
  const cover =
    t.album?.images?.[0]?.url ?? fallbackCover;
  return {
    spotifyId: t.id,
    title: t.name ?? "Titre inconnu",
    artists:
      t.artists?.map((a) => a.name).filter(Boolean).join(", ") ||
      "Artiste inconnu",
    album: t.album?.name ?? "",
    coverUrl: cover,
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
    isPlayable: t.is_playable !== false,
  };
}

async function fetchPaged(
  firstUrl: string
): Promise<SpotifyTrackObject[]> {
  const items: SpotifyTrackObject[] = [];
  let url: string | null = firstUrl;
  // Garde-fou : 300 pistes max par résolution.
  while (url && items.length < 300) {
    const res = await authedFetch(url);
    const data = (await res.json()) as {
      items?: Array<{ track?: SpotifyTrackObject | null } | SpotifyTrackObject>;
      next?: string | null;
    };
    for (const entry of data.items ?? []) {
      const track =
        entry && typeof entry === "object" && "track" in entry
          ? (entry as { track?: SpotifyTrackObject | null }).track
          : (entry as SpotifyTrackObject);
      if (track) items.push(track);
    }
    url = data.next ?? null;
  }
  return items;
}

const FIELDS =
  "items(track(id,name,artists(name),album(name,images),duration_ms,external_ids.isrc,is_playable)),next,total";

/** Pistes d'une playlist via Web API (paginé, 100/page). Null si indisponible. */
export async function fetchSpotifyPlaylistTracks(
  playlistId: string
): Promise<{ items: SpotifyApiTrack[]; total: number } | null> {
  if (!(await getSpotifyToken())) return null;
  try {
    const raw = await fetchPaged(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&market=${SPOTIFY_MARKET}&fields=${encodeURIComponent(FIELDS)}`
    );
    const items = raw
      .map((t) => toApiTrack(t))
      .filter((t): t is SpotifyApiTrack => t !== null);
    return { items, total: raw.length };
  } catch (e) {
    console.warn(`[spotify-api] playlist failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Pistes d'un album via Web API (paginé, 50/page). Null si indisponible. */
export async function fetchSpotifyAlbumTracks(
  albumId: string
): Promise<{ items: SpotifyApiTrack[]; albumCover?: string } | null> {
  if (!(await getSpotifyToken())) return null;
  try {
    const raw = await fetchPaged(
      `https://api.spotify.com/v1/albums/${encodeURIComponent(albumId)}/tracks?limit=50&market=${SPOTIFY_MARKET}&fields=${encodeURIComponent("items(id,name,artists(name),duration_ms,external_ids.isrc),next,total")}`
    );
    // Pochette de l'album (les pistes d'album n'embarquent pas d'images).
    let albumCover: string | undefined;
    try {
      const data = await spotifyFetch<{ images?: Array<{ url?: string }> }>(
        `albums/${encodeURIComponent(albumId)}`,
        { fields: "images" }
      );
      albumCover = data.images?.[0]?.url;
    } catch {
      // pochette optionnelle
    }
    const items = raw
      .map((t) => toApiTrack(t, albumCover))
      .filter((t): t is SpotifyApiTrack => t !== null);
    return { items, albumCover };
  } catch (e) {
    console.warn(`[spotify-api] album failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export interface SpotifySearchTrack extends SpotifyApiTrack {
  popularity?: number;
}

export interface SpotifySearchAlbum {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
  trackCount?: number;
  releaseDate?: string;
}

export interface SpotifySearchArtist {
  id: string;
  name: string;
  imageUrl?: string;
  followers?: number;
}

export interface SpotifySearchPlaylist {
  id: string;
  name: string;
  owner: string;
  coverUrl?: string;
  trackCount?: number;
}

export interface SpotifySearchResult {
  tracks: SpotifySearchTrack[];
  albums: SpotifySearchAlbum[];
  artists: SpotifySearchArtist[];
  playlists: SpotifySearchPlaylist[];
}

function artistsName(list?: Array<{ name?: string }>): string {
  return list?.map((a) => a?.name).filter(Boolean).join(", ") || "Artiste inconnu";
}

function firstImage(images?: Array<{ url?: string }>): string | undefined {
  return images?.[0]?.url;
}

/**
 * Recherche universelle Spotify (titres, albums, artistes, playlists).
 * Cache in-memory 5min. Null si indisponible (l'appelant bascule
 * sur la recherche YouTube).
 */
export async function searchSpotify(
  query: string,
  types: string[] = ["track", "album", "artist", "playlist"],
  limit = 8
): Promise<SpotifySearchResult | null> {
  const cacheKey = `search|${SPOTIFY_MARKET}|${types.join(",")}|${limit}|${query}`;
  const cached = cacheGet<SpotifySearchResult>(cacheKey);
  if (cached) return cached;
  try {
    const data = await spotifyFetch<{
      tracks?: { items?: Array<SpotifyTrackObject & { popularity?: number }> };
      albums?: {
        items?: Array<{
          id?: string;
          name?: string;
          artists?: Array<{ name?: string }>;
          images?: Array<{ url?: string }>;
          total_tracks?: number;
          release_date?: string;
        }>;
      };
      artists?: {
        items?: Array<{
          id?: string;
          name?: string;
          images?: Array<{ url?: string }>;
          followers?: { total?: number };
        }>;
      };
      playlists?: {
        items?: Array<{
          id?: string;
          name?: string;
          owner?: { display_name?: string };
          images?: Array<{ url?: string }>;
          tracks?: { total?: number };
        } | null>;
      };
    }>("search", {
      q: query,
      type: types.join(","),
      limit: String(limit),
    });
    const result: SpotifySearchResult = {
      tracks: (data.tracks?.items ?? [])
        .map((t) => {
          const base = toApiTrack(t);
          if (!base) return null;
          const track: SpotifySearchTrack = { ...base };
          if (typeof t.popularity === "number") track.popularity = t.popularity;
          return track;
        })
        .filter((t): t is SpotifySearchTrack => t !== null),
      albums: (data.albums?.items ?? [])
        .filter((a) => a?.id)
        .map((a) => ({
          id: a.id!,
          name: a.name ?? "Album",
          artist: artistsName(a.artists),
          coverUrl: firstImage(a.images),
          trackCount: a.total_tracks,
          releaseDate: a.release_date,
        })),
      artists: (data.artists?.items ?? [])
        .filter((a) => a?.id)
        .map((a) => ({
          id: a.id!,
          name: a.name ?? "Artiste",
          imageUrl: firstImage(a.images),
          followers: a.followers?.total,
        })),
      playlists: (data.playlists?.items ?? [])
        .filter((p) => p?.id)
        .map((p) => ({
          id: p!.id!,
          name: p!.name ?? "Playlist",
          owner: p!.owner?.display_name ?? "Spotify",
          coverUrl: firstImage(p!.images),
          trackCount: p!.tracks?.total,
        })),
    };
    cacheSet(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`[spotify-api] search failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export interface SpotifyArtist {
  id: string;
  name: string;
  imageUrl?: string;
  followers?: number;
  genres?: string[];
}

/** Fiche artiste. Null si indisponible. */
export async function getSpotifyArtist(id: string): Promise<SpotifyArtist | null> {
  try {
    const data = await spotifyFetch<{
      id?: string;
      name?: string;
      images?: Array<{ url?: string }>;
      followers?: { total?: number };
      genres?: string[];
    }>(`artists/${encodeURIComponent(id)}`);
    if (!data?.id) return null;
    return {
      id: data.id,
      name: data.name ?? "Artiste",
      imageUrl: firstImage(data.images),
      followers: data.followers?.total,
      genres: data.genres,
    };
  } catch {
    return null;
  }
}

/** Albums d'un artiste (200 vérifié, top-tracks bloqué côté Spotify). */
export async function getArtistAlbums(id: string): Promise<SpotifySearchAlbum[]> {
  try {
    const data = await spotifyFetch<{
      items?: Array<{
        id?: string;
        name?: string;
        artists?: Array<{ name?: string }>;
        images?: Array<{ url?: string }>;
        total_tracks?: number;
        release_date?: string;
      }>;
    }>(`artists/${encodeURIComponent(id)}/albums`, {
      limit: "10",
      include_groups: "album,single",
    });
    return (data.items ?? [])
      .filter((a) => a?.id)
      .map((a) => ({
        id: a.id!,
        name: a.name ?? "Album",
        artist: artistsName(a.artists),
        coverUrl: firstImage(a.images),
        trackCount: a.total_tracks,
        releaseDate: a.release_date,
      }));
  } catch {
    return [];
  }
}

/** Détail d'un titre (pour enrichissement avant matching). Null si indisponible. */
export async function getSpotifyTrack(
  id: string
): Promise<{
  id: string;
  title: string;
  artists: string;
  album: string;
  coverUrl?: string;
  durationMs?: number;
  isrc?: string;
} | null> {
  try {
    const data = await spotifyFetch<{
      id?: string;
      name?: string;
      artists?: Array<{ name?: string }>;
      album?: { name?: string; images?: Array<{ url?: string }> };
      duration_ms?: number;
      external_ids?: { isrc?: string };
    }>(`tracks/${encodeURIComponent(id)}`, {
      fields: "id,name,artists(name),album(name,images),duration_ms,external_ids.isrc",
    });
    if (!data?.id) return null;
    return {
      id: data.id,
      title: data.name ?? "Titre inconnu",
      artists:
        data.artists?.map((a) => a.name).filter(Boolean).join(", ") ||
        "Artiste inconnu",
      album: data.album?.name ?? "",
      coverUrl: data.album?.images?.[0]?.url,
      durationMs: data.duration_ms,
      isrc: data.external_ids?.isrc,
    };
  } catch {
    return null;
  }
}

/** Détail album (titre, artiste, cover, nb pistes). Null si indisponible. */
export async function getSpotifyAlbum(
  id: string
): Promise<{ id: string; name: string; artist: string; coverUrl?: string; trackCount?: number } | null> {
  try {
    const data = await spotifyFetch<{
      id?: string;
      name?: string;
      artists?: Array<{ name?: string }>;
      images?: Array<{ url?: string }>;
      total_tracks?: number;
    }>(`albums/${encodeURIComponent(id)}`, { fields: "id,name,artists(name),images,total_tracks" });
    if (!data?.id) return null;
    return {
      id: data.id,
      name: data.name ?? "Album",
      artist: artistsName(data.artists),
      coverUrl: firstImage(data.images),
      trackCount: data.total_tracks,
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
 * BROWSE API — Découvrir (catégories, featured, nouveautés).
 * Cache in-memory 15min : ces contenus changent peu.
 * Jamais de clé côté client : module server-only (voir en-tête).
 * ═══════════════════════════════════════════════════════════════ */

const BROWSE_TTL_MS = 15 * 60 * 1000;
const browseCache = new Map<string, { at: number; data: unknown }>();

function browseGet<T>(key: string): T | null {
  const entry = browseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > BROWSE_TTL_MS) {
    browseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function browseSet(key: string, data: unknown): void {
  if (browseCache.size > 100) browseCache.clear();
  browseCache.set(key, { at: Date.now(), data });
}

/** Vide le cache browse (bouton ↻ "forcer l'actualisation"). */
export function clearBrowseCache(): void {
  browseCache.clear();
}

export interface SpotifyCategory {
  id: string;
  name: string;
  iconUrl?: string;
}

interface CategoryObject {
  id?: string;
  name?: string;
  icons?: Array<{ url?: string }>;
}

/** Catégories browse (limit 50, market FR). */
export async function getBrowseCategories(limit = 50): Promise<SpotifyCategory[]> {
  const key = `categories|${SPOTIFY_MARKET}|${limit}`;
  const cached = browseGet<SpotifyCategory[]>(key);
  if (cached) return cached;
  try {
    const data = await spotifyFetch<{ categories?: { items?: CategoryObject[] } }>(
      "browse/categories",
      { limit: String(Math.min(Math.max(limit, 1), 50)) }
    );
    const items = (data.categories?.items ?? [])
      .filter((c) => c?.id)
      .map((c) => ({
        id: c.id!,
        name: c.name ?? c.id!,
        iconUrl: c.icons?.[0]?.url,
      }));
    browseSet(key, items);
    return items;
  } catch (e) {
    console.warn(`[spotify-api] categories failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

export interface SpotifyCategoryPlaylist {
  id: string;
  name: string;
  description: string;
  owner: string;
  coverUrl?: string;
  trackCount?: number;
}

function toCategoryPlaylist(p: {
  id?: string;
  name?: string;
  description?: string;
  owner?: { display_name?: string };
  images?: Array<{ url?: string }>;
  tracks?: { total?: number };
}): SpotifyCategoryPlaylist | null {
  if (!p?.id) return null;
  return {
    id: p.id,
    name: p.name ?? "Playlist",
    description: (p.description ?? "").replace(/<[^>]*>/g, ""),
    owner: p.owner?.display_name ?? "Spotify",
    coverUrl: firstImage(p.images),
    trackCount: p.tracks?.total,
  };
}

/** Playlists publiques d'une catégorie (limit 20). */
export async function getCategoryPlaylists(
  categoryId: string,
  limit = 20
): Promise<SpotifyCategoryPlaylist[]> {
  const key = `catpl|${SPOTIFY_MARKET}|${categoryId}|${limit}`;
  const cached = browseGet<SpotifyCategoryPlaylist[]>(key);
  if (cached) return cached;
  try {
    const data = await spotifyFetch<{
      playlists?: {
        items?: Array<{
          id?: string;
          name?: string;
          description?: string;
          owner?: { display_name?: string };
          images?: Array<{ url?: string }>;
          tracks?: { total?: number };
        } | null>;
      };
    }>(`browse/categories/${encodeURIComponent(categoryId)}/playlists`, {
      limit: String(Math.min(Math.max(limit, 1), 50)),
    });
    const items = (data.playlists?.items ?? [])
      .map((p) => (p ? toCategoryPlaylist(p) : null))
      .filter((p): p is SpotifyCategoryPlaylist => p !== null);
    browseSet(key, items);
    return items;
  } catch (e) {
    console.warn(`[spotify-api] category playlists failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** Nom d'une catégorie (pour le header de /discover/[id]). */
export async function getBrowseCategory(id: string): Promise<SpotifyCategory | null> {
  try {
    const data = await spotifyFetch<CategoryObject>(
      `browse/categories/${encodeURIComponent(id)}`
    );
    if (!data?.id) return null;
    return { id: data.id, name: data.name ?? data.id, iconUrl: data.icons?.[0]?.url };
  } catch {
    // Repli : retrouver le nom dans la liste des catégories.
    const all = await getBrowseCategories().catch(() => []);
    return all.find((c) => c.id === id) ?? null;
  }
}

/** Sélection du moment (featured-playlists). */
export async function getFeaturedPlaylists(limit = 10): Promise<SpotifyCategoryPlaylist[]> {
  const key = `featured|${SPOTIFY_MARKET}|${limit}`;
  const cached = browseGet<SpotifyCategoryPlaylist[]>(key);
  if (cached) return cached;
  try {
    const data = await spotifyFetch<{
      message?: string;
      playlists?: {
        items?: Array<{
          id?: string;
          name?: string;
          description?: string;
          owner?: { display_name?: string };
          images?: Array<{ url?: string }>;
          tracks?: { total?: number };
        } | null>;
      };
    }>("browse/featured-playlists", { limit: String(Math.min(Math.max(limit, 1), 50)) });
    const items = (data.playlists?.items ?? [])
      .map((p) => (p ? toCategoryPlaylist(p) : null))
      .filter((p): p is SpotifyCategoryPlaylist => p !== null);
    browseSet(key, items);
    return items;
  } catch (e) {
    console.warn(`[spotify-api] featured failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

export interface SpotifyNewRelease {
  id: string;
  name: string;
  artist: string;
  coverUrl?: string;
  releaseDate?: string;
  trackCount?: number;
}

/** Nouveautés albums (new-releases). */
export async function getNewReleases(limit = 10): Promise<SpotifyNewRelease[]> {
  const key = `newrel|${SPOTIFY_MARKET}|${limit}`;
  const cached = browseGet<SpotifyNewRelease[]>(key);
  if (cached) return cached;
  try {
    const data = await spotifyFetch<{
      albums?: {
        items?: Array<{
          id?: string;
          name?: string;
          artists?: Array<{ name?: string }>;
          images?: Array<{ url?: string }>;
          release_date?: string;
          total_tracks?: number;
        }>;
      };
    }>("browse/new-releases", { limit: String(Math.min(Math.max(limit, 1), 50)) });
    const items = (data.albums?.items ?? [])
      .filter((a) => a?.id)
      .map((a) => ({
        id: a.id!,
        name: a.name ?? "Album",
        artist: artistsName(a.artists),
        coverUrl: firstImage(a.images),
        releaseDate: a.release_date,
        trackCount: a.total_tracks,
      }));
    browseSet(key, items);
    return items;
  } catch (e) {
    console.warn(`[spotify-api] new-releases failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** Métadonnées d'une playlist Spotify (page détail / import). */
export async function getSpotifyPlaylistMeta(
  id: string
): Promise<{
  id: string;
  name: string;
  description: string;
  owner: string;
  coverUrl?: string;
  trackCount?: number;
} | null> {
  try {
    const data = await spotifyFetch<{
      id?: string;
      name?: string;
      description?: string | null;
      owner?: { display_name?: string };
      images?: Array<{ url?: string }>;
      tracks?: { total?: number };
    }>(`playlists/${encodeURIComponent(id)}`, {
      fields: "id,name,description,owner(display_name),images,tracks(total)",
    });
    if (!data?.id) return null;
    return {
      id: data.id,
      name: data.name ?? "Playlist Spotify",
      description: (data.description ?? "").replace(/<[^>]*>/g, ""),
      owner: data.owner?.display_name ?? "Spotify",
      coverUrl: firstImage(data.images),
      trackCount: data.tracks?.total,
    };
  } catch {
    return null;
  }
}
