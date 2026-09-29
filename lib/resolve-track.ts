import type { Track } from "@/lib/types";
import { lookupByIsrc } from "@/lib/providers/itunes";
import { searchYouTube, type SearchResult } from "@/lib/providers/search";
import { getSpotifyTrack } from "@/lib/providers/spotify-api";
import { toYouTubeTrack, isOfficialChannel } from "@/lib/youtube-track";

export interface ResolveTrackInput {
  platform?: "spotify";
  trackId?: string;
  isrc?: string;
  title: string;
  artist: string;
  durationMs?: number;
  album?: string;
  coverUrl?: string;
}

export type ResolveTrackSource = "youtube" | "spotify";

export interface ResolveTrackResult {
  track: Track;
  source: ResolveTrackSource;
}

const DURATION_TOLERANCE_MS = 30_000;
const MAX_DURATION_MS = 12 * 60 * 1000;

/**
 * Choisit la meilleure vidéo : durée proche de l'attendue (±30s) puis
 * canal officiel (VEVO/Topic/officiel) priorisé, sinon premier résultat
 * de moins de 12min, sinon premier résultat.
 */
export function pickVideo(
  results: SearchResult[],
  expectedMs?: number
): SearchResult | null {
  if (results.length === 0) return null;
  let pool = results;
  if (expectedMs !== undefined) {
    const fitting = results.filter(
      (r) =>
        r.durationMs !== undefined &&
        Math.abs(r.durationMs - expectedMs) <= DURATION_TOLERANCE_MS
    );
    if (fitting.length > 0) pool = fitting;
  }
  const capped = pool.filter(
    (r) => (r.durationMs ?? MAX_DURATION_MS - 1) < MAX_DURATION_MS
  );
  if (capped.length > 0) pool = capped;
  return pool.find((r) => isOfficialChannel(r.channel)) ?? pool[0] ?? null;
}

/**
 * Pipeline de résolution unifié (server-only via ses dépendances).
 * 1. Enrichissement exact : Spotify track (si trackId) puis iTunes ISRC
 *    → métadonnées canoniques + lien Apple Music.
 *    (Note : YouTube n'a pas d'opérateur de recherche ISRC ; l'ISRC sert
 *    à fiabiliser les métadonnées, le match YouTube se fait sur
 *    titre/artiste filtré par durée et canal officiel.)
 * 2. Piste Spotify d'origine seulement en dernier recours (jamais de
 *    lecture directe sans match : le fallback lazy du moteur couvre).
 * 3. Sinon recherche texte classique (même chemin, sans ISRC).
 */
export async function resolveTrack(
  input: ResolveTrackInput
): Promise<ResolveTrackResult> {
  let title = input.title;
  let artist = input.artist;
  let durationMs = input.durationMs;
  let coverUrl = input.coverUrl;
  let album = input.album;
  let isrc = input.isrc;
  let appleMusicUrl: string | undefined;

  if (input.platform === "spotify" && input.trackId && (!isrc || !durationMs)) {
    const sp = await getSpotifyTrack(input.trackId).catch(() => null);
    if (sp) {
      title = sp.title;
      artist = sp.artists;
      durationMs = sp.durationMs ?? durationMs;
      coverUrl = sp.coverUrl ?? coverUrl;
      album = sp.album || album;
      isrc = sp.isrc ?? isrc;
    }
  }

  if (isrc) {
    const match = await lookupByIsrc(isrc).catch(() => null);
    if (match) {
      title = match.trackName;
      artist = match.artistName;
      durationMs = match.durationMs ?? durationMs;
      coverUrl = match.artworkUrl ?? coverUrl;
      appleMusicUrl = match.trackViewUrl;
    }
  }

  const results = await searchYouTube(`${title} ${artist}`).catch(() => []);
  const video = pickVideo(results, durationMs);
  if (video) {
    return {
      source: "youtube",
      track: toYouTubeTrack(video, {
        title,
        artist,
        coverUrl,
        durationMs,
        isrc,
        album,
        appleMusicUrl,
      }),
    };
  }

  if (input.platform === "spotify" && input.trackId) {
    const trackId = input.trackId;
    return {
      source: "spotify",
      track: {
        id: `spotify:track:${trackId}`,
        platform: "spotify",
        platformTrackId: trackId,
        title,
        artist,
        coverUrl,
        sourceUrl: `https://open.spotify.com/track/${trackId}`,
        durationMs,
        isrc,
        album: album || undefined,
        appleMusicUrl,
      },
    };
  }

  throw new Error("Titre introuvable.");
}
