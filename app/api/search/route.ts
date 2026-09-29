import { NextResponse } from "next/server";
import { searchSpotify } from "@/lib/providers/spotify-api";
import { searchYouTube } from "@/lib/providers/search";

/**
 * Recherche universelle : Spotify d'abord (titres, albums, artistes,
 * playlists groupés), repli YouTube si indisponible (garde-fou,
 * jamais de page morte).
 *
 * ?q= : requête (min 2 caractères)
 * ?type= : all | track | artist | album | playlist (défaut all)
 * ?limit= : résultats par type (défaut 8, max 50 ; 12 si filtre actif)
 * ?source=youtube : force le mode YouTube (fallback moteur).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ source: "youtube", results: [] });
  }

  // ?source=youtube : force le mode YouTube (fallback moteur).
  if (searchParams.get("source") !== "youtube") {
    const typeParam = (searchParams.get("type") ?? "all").toLowerCase();
    const allowed = ["track", "album", "artist", "playlist"];
    const types = allowed.includes(typeParam) ? [typeParam] : allowed;
    const rawLimit = Number(searchParams.get("limit") ?? "");
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.floor(rawLimit), 1), 50)
      : types.length === 1
        ? 12
        : 8;

    const spotify = await searchSpotify(q, types, limit).catch(() => null);

    if (spotify) {
      const empty =
        spotify.tracks.length === 0 &&
        spotify.albums.length === 0 &&
        spotify.artists.length === 0 &&
        spotify.playlists.length === 0;
      if (!empty) {
        return NextResponse.json({ source: "spotify", ...spotify });
      }
    }
  }

  try {
    const results = await searchYouTube(q);
    return NextResponse.json({ source: "youtube", results });
  } catch {
    return NextResponse.json(
      { error: "Recherche indisponible." },
      { status: 502 }
    );
  }
}
