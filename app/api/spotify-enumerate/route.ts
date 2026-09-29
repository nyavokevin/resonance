import { NextResponse } from "next/server";
import { enumerateSpotifyCollection } from "@/lib/providers/resolve";

/**
 * Énumération brute d'une collection Spotify (métadonnées seules,
 * sans matching YouTube) : la page d'import résout ensuite chaque
 * piste via /api/resolve-track avec progression.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = searchParams.get("id")?.trim();
  if ((kind !== "album" && kind !== "playlist") || !id) {
    return NextResponse.json(
      { error: "Paramètres kind (album|playlist) et id requis." },
      { status: 400 }
    );
  }

  try {
    const enumerated = await enumerateSpotifyCollection(
      kind,
      id,
      kind === "album" ? "Album Spotify" : "Playlist Spotify"
    );
    if (!enumerated || enumerated.items.length === 0) {
      return NextResponse.json(
        { error: "Collection Spotify introuvable." },
        { status: 422 }
      );
    }
    return NextResponse.json(enumerated);
  } catch {
    return NextResponse.json(
      { error: "Collection Spotify indisponible." },
      { status: 502 }
    );
  }
}
