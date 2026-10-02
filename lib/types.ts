import { fr } from "./i18n/fr";

export type Platform =
  | "spotify"
  | "youtube"
  | "youtube-music"
  | "apple-music"
  | "soundcloud"
  | "direct";

export type LinkKind = "track" | "album" | "playlist" | "direct";

export interface Track {
  id: string;
  platform: Platform;
  platformTrackId: string;
  title: string;
  artist: string;
  coverUrl?: string;
  sourceUrl: string;
  durationMs?: number;
  /** Piste injectée par la radio autoplay (phase 4) */
  auto?: boolean;
  /**
   * URI Spotify complète à charger dans l'embed
   * (ex. spotify:playlist:xxx quand l'énumération a échoué).
   * Défaut : spotify:track:{platformTrackId}.
   */
  embedUri?: string;
  /** Code ISRC (Spotify Web API), pour matching exact. */
  isrc?: string;
  /** Nom de l'album d'origine (collections Spotify). */
  album?: string;
  /** Lien Apple Music exact (lookup ISRC, info externe). */
  appleMusicUrl?: string;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  "youtube-music": "YouTube Music",
  "apple-music": "Apple Music",
  soundcloud: "SoundCloud",
  direct: fr.types.fileLabel,
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  spotify: "#1DB954",
  youtube: "#FF0000",
  "youtube-music": "#FF0000",
  "apple-music": "#FA243C",
  soundcloud: "#FF5500",
  direct: "#B5BAC1",
};
