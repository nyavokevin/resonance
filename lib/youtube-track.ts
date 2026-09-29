import type { Track } from "@/lib/types";
import type { SearchResult } from "@/lib/providers/search";

export interface YouTubeMeta {
  title: string;
  artist: string;
  coverUrl?: string;
  durationMs?: number;
  isrc?: string;
  album?: string;
  appleMusicUrl?: string;
}

/** Résultat de recherche YouTube → Track jouable. */
export function searchResultToTrack(result: SearchResult): Track {
  return {
    id: `youtube:track:${result.videoId}`,
    platform: "youtube",
    platformTrackId: result.videoId,
    title: result.title,
    artist: result.channel,
    coverUrl: result.thumbnail,
    sourceUrl: `https://www.youtube.com/watch?v=${result.videoId}`,
    durationMs: result.durationMs,
  };
}

/**
 * Construit un Track YouTube jouable à partir d'un résultat de recherche.
 * Titres/artistes canoniques (source), miniature/durée/URL de la vidéo
 * (ce qui est réellement lu). Utilisé par le moteur (fallback lazy),
 * la résolution Spotify et le pipeline unifié — un seul mapping partout.
 */
export function toYouTubeTrack(
  video: SearchResult,
  meta: YouTubeMeta
): Track {
  return {
    id: `youtube:track:${video.videoId}`,
    platform: "youtube",
    platformTrackId: video.videoId,
    title: meta.title,
    artist: meta.artist,
    coverUrl: video.thumbnail ?? meta.coverUrl,
    sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    durationMs: video.durationMs ?? meta.durationMs,
    isrc: meta.isrc,
    album: meta.album || undefined,
    appleMusicUrl: meta.appleMusicUrl,
  };
}

/** Une chaîne ressemble-t-elle à un canal officiel (VEVO, Topic, officiel) ? */
export function isOfficialChannel(channel: string): boolean {
  return /vevo|official|- topic$/i.test(channel.trim());
}
