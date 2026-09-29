import type { Track } from "@/lib/types";
import type { DetectedLink } from "@/lib/detect";
import {
  fetchSpotifyPlaylistTracks,
  fetchSpotifyAlbumTracks,
} from "@/lib/providers/spotify-api";
import { lookupByIsrc, type ITunesMatch } from "@/lib/providers/itunes";
import { searchYouTube, type SearchResult } from "@/lib/providers/search";
import { toYouTubeTrack as toSharedYouTubeTrack } from "@/lib/youtube-track";
import { pickVideo, resolveTrack } from "@/lib/resolve-track";

export interface ResolveResult {
  kind: DetectedLink["kind"];
  tracks: Track[];
  collectionTitle?: string;
  error?: string;
}

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

async function fetchOEmbed(url: string): Promise<OEmbed | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as OEmbed;
  } catch {
    return null;
  }
}

interface SpotifyEmbedItem {
  uri?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  isPlayable?: boolean;
}

/** Extrait le JSON __NEXT_DATA__ d'une page embed Spotify (equilibrage d'accolades). */
function extractNextData(html: string): unknown | null {
  const marker = '<script id="__NEXT_DATA__"';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const brace = html.indexOf("{", start);
  if (brace === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(brace, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Recherche recursive du premier tableau trackList exploitable. */
function findTrackList(node: unknown): SpotifyEmbedItem[] | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTrackList(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.trackList)) {
    const items = (obj.trackList as SpotifyEmbedItem[]).filter(
      (t) => typeof t?.uri === "string" && t.uri.startsWith("spotify:track:")
    );
    if (items.length > 0) return items;
  }
  for (const key of Object.keys(obj)) {
    const found = findTrackList(obj[key]);
    if (found) return found;
  }
  return null;
}

/** Normalise "A, B, C" (le separateur Spotify contient des espaces insecables). */
function cleanArtists(subtitle: string | undefined): string {
  if (!subtitle) return "Artiste inconnu";
  const cleaned = subtitle
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
  return cleaned || "Artiste inconnu";
}

/** Exécute fn sur les items avec au plus `limit` tâches simultanées. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export interface CollectionItem {
  spotifyId: string;
  title: string;
  artists: string;
  album: string;
  coverUrl?: string;
  durationMs?: number;
  isrc?: string;
  isPlayable: boolean;
}

export interface EnumeratedCollection {
  title: string;
  coverUrl?: string;
  items: CollectionItem[];
}

/**
 * Énumère une collection Spotify (métadonnées seules, sans matching) :
 * Web API si credentials (pagination + ISRC), sinon scraping embed.
 * Utilisé par /api/resolve (lecture) et /api/spotify-enumerate (import).
 */
export async function enumerateSpotifyCollection(
  kind: DetectedLink["kind"],
  id: string,
  fallbackTitle: string,
  coverUrl?: string
): Promise<EnumeratedCollection | null> {
  if (kind !== "album" && kind !== "playlist") return null;

  // 1. Spotify Web API (si credentials) : pagination complete + ISRC.
  try {
    const apiResult =
      kind === "playlist"
        ? await fetchSpotifyPlaylistTracks(id)
        : await fetchSpotifyAlbumTracks(id);
    if (apiResult && apiResult.items.length > 0) {
      const items: CollectionItem[] = apiResult.items.map((t) => ({
        spotifyId: t.spotifyId,
        title: t.title,
        artists: t.artists,
        album: t.album,
        coverUrl: t.coverUrl ?? coverUrl,
        durationMs: t.durationMs,
        isrc: t.isrc,
        isPlayable: t.isPlayable,
      }));
      const cover =
        coverUrl ??
        ("albumCover" in apiResult ? apiResult.albumCover : undefined) ??
        items[0]?.coverUrl;
      return { title: fallbackTitle, coverUrl: cover, items };
    }
  } catch {
    // on bascule sur le scraping embed ci-dessous
  }

  // 2. Fallback : scraping de la page embed (sans credentials).
  try {
    const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[resolve] embed ${kind}/${id}: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    if (!html.includes("__NEXT_DATA__")) {
      console.warn(`[resolve] embed ${kind}/${id}: pas de __NEXT_DATA__ (page vide/bloquée)`);
      return null;
    }
    const data = extractNextData(html);
    if (!data) {
      console.warn(`[resolve] embed ${kind}/${id}: JSON illisible`);
      return null;
    }
    const found = findTrackList(data);
    if (!found) {
      console.warn(`[resolve] embed ${kind}/${id}: aucune trackList (playlist privée/supprimée ?)`);
      return null;
    }
    const items: CollectionItem[] = found.map((item) => ({
      spotifyId: item.uri!.split(":").pop()!,
      title: item.title?.trim() || fallbackTitle,
      artists: cleanArtists(item.subtitle),
      album: "",
      coverUrl,
      durationMs: typeof item.duration === "number" ? item.duration : undefined,
      isPlayable: item.isPlayable !== false,
    }));
    return { title: fallbackTitle, coverUrl, items };
  } catch {
    return null;
  }
}

function toYouTubeTrack(
  video: SearchResult,
  item: CollectionItem,
  appleMusicUrl?: string
): Track {
  return toSharedYouTubeTrack(video, {
    title: item.title,
    artist: item.artists,
    coverUrl: item.coverUrl,
    durationMs: item.durationMs,
    isrc: item.isrc,
    album: item.album,
    appleMusicUrl,
  });
}

function toSpotifyTrack(
  item: CollectionItem,
  match: ITunesMatch | null,
  coverUrl?: string
): Track {
  return {
    id: `spotify:track:${item.spotifyId}`,
    platform: "spotify",
    platformTrackId: item.spotifyId,
    title: match?.trackName ?? item.title,
    artist: match?.artistName ?? item.artists,
    coverUrl: match?.artworkUrl ?? item.coverUrl ?? coverUrl,
    sourceUrl: `https://open.spotify.com/track/${item.spotifyId}`,
    durationMs: match?.durationMs ?? item.durationMs,
    isrc: item.isrc,
    album: item.album || undefined,
    appleMusicUrl: match?.trackViewUrl,
  };
}

/**
 * Résout chaque piste vers une source jouable.
 *
 * Règle produit : AUCUNE lecture via Spotify — tout morceau issu de
 * données Spotify est matché vers YouTube (lecture intégrale via
 * l'adapter YouTube). Spotify ne sert qu'aux métadonnées sources.
 * 1. Métadonnées canoniques via iTunes (lookup ISRC exact, best-effort).
 * 2. Équivalent YouTube (recherche "titre artiste", conc. limitée).
 * 3. Dernier recours : piste Spotify d'origine (le fallback lazy du
 *    moteur retentera YouTube à la lecture en cas d'échec).
 * Apple Music n'est jamais utilisé comme plateforme de lecture
 * (l'embed ne fournit ni position ni fin de piste) : le lien exact
 * est conservé dans appleMusicUrl à titre informatif.
 */
async function matchCollectionItems(
  items: CollectionItem[],
  defaultCover?: string
): Promise<Track[]> {
  const enriched = await mapLimit(items, 6, async (item) => {
    const match = item.isrc
      ? await lookupByIsrc(item.isrc).catch(() => null)
      : null;
    return { item, match };
  });

  const ytBySpotifyId = new Map<string, SearchResult>();

  async function tryMatch(item: CollectionItem): Promise<void> {
    try {
      const results = await searchYouTube(`${item.title} ${item.artists}`);
      const video = pickVideo(results, item.durationMs);
      if (video?.videoId) ytBySpotifyId.set(item.spotifyId, video);
    } catch {
      // ignore : seconde passe ou fallback lazy du moteur
    }
  }

  await mapLimit(enriched, 4, ({ item }) => tryMatch(item));

  // Seconde passe sur les échecs : YouTube limite souvent en cours de
  // rafale, une pause + réessai lent récupère la plupart des ratés.
  // Si rien n'a matché du tout (panne globale), on ne réessaie pas.
  const missed = enriched.filter(({ item }) => !ytBySpotifyId.has(item.spotifyId));
  if (missed.length > 0 && ytBySpotifyId.size > 0) {
    await new Promise((r) => setTimeout(r, 2500));
    await mapLimit(missed, 2, ({ item }) => tryMatch(item));
  }

  return enriched.map(({ item, match }) => {
    const video = ytBySpotifyId.get(item.spotifyId);
    if (video) {
      return toYouTubeTrack(video, item, match?.trackViewUrl);
    }
    return toSpotifyTrack(item, match, defaultCover);
  });
}

/** Enumere les pistes d'un album / playlist via sa page embed. */
async function resolveSpotifyCollection(
  kind: DetectedLink["kind"],
  id: string,
  fallbackTitle: string,
  coverUrl?: string
): Promise<Track[] | null> {
  const enumerated = await enumerateSpotifyCollection(
    kind,
    id,
    fallbackTitle,
    coverUrl
  );
  if (!enumerated) return null;
  return matchCollectionItems(enumerated.items, enumerated.coverUrl);
}

async function resolveSpotify(link: DetectedLink): Promise<ResolveResult> {
  const oembed = await fetchOEmbed(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`
  );
  const title = oembed?.title ?? "Titre Spotify";
  const cover = oembed?.thumbnail_url;
  // oEmbed échoue (404) pour les contenus privés, supprimés ou inexistants.
  const collectionExists = oembed !== null;

  if (link.kind === "track") {
    // oEmbed ne donne pas l'artiste : on le récupère depuis la page embed
    let artist = "Artiste inconnu";
    let durationMs: number | undefined;
    try {
      const res = await fetch(
        `https://open.spotify.com/embed/track/${link.id}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const html = await res.text();
      const artistMatch = html.match(/"artists":\[\{"name":"([^"]+)"/);
      if (artistMatch) artist = artistMatch[1];
      const durationMatch = html.match(/"duration":(\d+)/);
      if (durationMatch) durationMs = Number(durationMatch[1]);
    } catch {
      // on garde l'artiste par défaut
    }
    // Pipeline unifié : ISRC/iTunes puis YouTube filtré (jamais Spotify).
    try {
      const { track } = await resolveTrack({
        platform: "spotify",
        trackId: link.id,
        title,
        artist,
        durationMs,
        coverUrl: cover,
      });
      return { kind: "track", tracks: [track] };
    } catch {
      return { kind: "track", tracks: [], error: "Titre Spotify illisible." };
    }
  }

  // Album / playlist : on énumère les vraies pistes pour un contrôle
  // complet (suivant/précédent/shuffle) au lieu d'un pseudo-morceau.
  const tracks = await resolveSpotifyCollection(
    link.kind,
    link.id,
    title,
    cover
  );
  if (tracks) {
    return { kind: link.kind, collectionTitle: title, tracks };
  }

  // Énumération impossible : aucun titre à matcher vers YouTube,
  // et pas de lecture via Spotify — on signale l'échec plutôt
  // qu'un pseudo-morceau illisible.
  return {
    kind: link.kind,
    tracks: [],
    error: collectionExists
      ? "Playlist Spotify illisible pour le moment, réessaie plus tard."
      : "Playlist Spotify introuvable ou privée — vérifie le lien (les playlists privées ne sont pas accessibles).",
  };
}

async function resolveYouTube(link: DetectedLink): Promise<ResolveResult> {
  const platform = link.platform;
  if (link.kind === "playlist") {
    const oembed = await fetchOEmbed(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`
    );
    const title = oembed?.title ?? "Playlist YouTube";
    return {
      kind: "playlist",
      collectionTitle: title,
      tracks: [
        {
          id: `${platform}:playlist:${link.id}`,
          platform,
          platformTrackId: link.id,
          title,
          artist: "Playlist",
          coverUrl: oembed?.thumbnail_url,
          sourceUrl: link.url,
        },
      ],
    };
  }

  const oembed = await fetchOEmbed(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`
  );
  return {
    kind: "track",
    tracks: [
      {
        id: `${platform}:track:${link.id}`,
        platform,
        platformTrackId: link.id,
        title: oembed?.title ?? "Vidéo YouTube",
        artist: oembed?.author_name ?? "YouTube",
        coverUrl:
          oembed?.thumbnail_url ?? `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`,
        sourceUrl:
          platform === "youtube-music"
            ? link.url
            : `https://www.youtube.com/watch?v=${link.id}`,
      },
    ],
  };
}

async function resolveAppleMusic(link: DetectedLink): Promise<ResolveResult> {
  const cc = link.url.split("/")[3] ?? "fr";
  const entity = link.kind === "track" ? "" : "&entity=song";

  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${link.id}${entity}&country=${cc}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = (await res.json()) as {
      resultCount: number;
      results: Array<{
        wrapperType: string;
        trackId?: number;
        trackName?: string;
        artistName?: string;
        collectionName?: string;
        artworkUrl100?: string;
        trackTimeMillis?: number;
        trackViewUrl?: string;
      }>;
    };

    const songs = data.results.filter((r) => r.wrapperType === "track");
    if (songs.length === 0) throw new Error("empty");

    if (link.kind === "track") {
      const s = songs[0];
      return {
        kind: "track",
        tracks: [
          {
            id: `apple-music:track:${s.trackId}`,
            platform: "apple-music",
            platformTrackId: String(s.trackId),
            title: s.trackName ?? "Titre Apple Music",
            artist: s.artistName ?? "Apple Music",
            coverUrl: s.artworkUrl100?.replace("100x100", "512x512"),
            sourceUrl: s.trackViewUrl ?? link.url,
            durationMs: s.trackTimeMillis,
          },
        ],
      };
    }

    const collection = data.results.find((r) => r.wrapperType === "collection");
    const albumName = collection?.collectionName ?? "Album";
    return {
      kind: "album",
      collectionTitle: albumName,
      tracks: songs.map((s) => ({
        id: `apple-music:track:${s.trackId}`,
        platform: "apple-music" as const,
        platformTrackId: String(s.trackId),
        title: s.trackName ?? "Titre",
        artist: s.artistName ?? "Apple Music",
        coverUrl: s.artworkUrl100?.replace("100x100", "512x512"),
        sourceUrl: s.trackViewUrl ?? link.url,
        durationMs: s.trackTimeMillis,
      })),
    };
  } catch {
    return { kind: link.kind, tracks: [], error: "Lien Apple Music illisible." };
  }
}

async function resolveSoundCloud(link: DetectedLink): Promise<ResolveResult> {
  const oembed = await fetchOEmbed(
    `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link.url)}`
  );
  const raw = oembed?.title ?? "Titre SoundCloud";
  const [title, artist = "SoundCloud"] = raw.split(" by ");
  return {
    kind: "track",
    tracks: [
      {
        id: `soundcloud:track:${link.id}`,
        platform: "soundcloud",
        platformTrackId: link.id,
        title: title.trim(),
        artist: (oembed?.author_name ?? artist).trim(),
        coverUrl: oembed?.thumbnail_url,
        sourceUrl: link.url,
      },
    ],
  };
}

function resolveDirect(link: DetectedLink): ResolveResult {
  const title = decodeURIComponent(link.id).replace(/\.[^.]+$/, "");
  return {
    kind: "direct",
    tracks: [
      {
        id: `direct:${link.id}`,
        platform: "direct",
        platformTrackId: link.id,
        title,
        artist: "Fichier local",
        sourceUrl: link.url,
      },
    ],
  };
}

export async function resolveLink(link: DetectedLink): Promise<ResolveResult> {
  switch (link.platform) {
    case "spotify":
      return resolveSpotify(link);
    case "youtube":
    case "youtube-music":
      return resolveYouTube(link);
    case "apple-music":
      return resolveAppleMusic(link);
    case "soundcloud":
      return resolveSoundCloud(link);
    case "direct":
      return resolveDirect(link);
  }
}
