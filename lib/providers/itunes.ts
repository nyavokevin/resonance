/**
 * Recherche iTunes par ISRC (sans clé) : correspondance exacte avec un
 * enregistrement, utilisée pour fiabiliser les métadonnées
 * (titre/artiste/durée/pochette canoniques + lien Apple Music).
 */

export interface ITunesMatch {
  trackName: string;
  artistName: string;
  artworkUrl?: string;
  durationMs?: number;
  trackViewUrl?: string;
}

export async function lookupByIsrc(isrc: string): Promise<ITunesMatch | null> {
  if (!isrc) return null;
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(isrc)}&entity=song&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      resultCount?: number;
      results?: Array<{
        trackName?: string;
        artistName?: string;
        artworkUrl100?: string;
        trackTimeMillis?: number;
        trackViewUrl?: string;
      }>;
    };
    const r = data.results?.[0];
    if (!r?.trackName) return null;
    return {
      trackName: r.trackName,
      artistName: r.artistName ?? "Artiste inconnu",
      artworkUrl: r.artworkUrl100?.replace("100x100", "600x600"),
      durationMs: r.trackTimeMillis,
      trackViewUrl: r.trackViewUrl,
    };
  } catch {
    return null;
  }
}
