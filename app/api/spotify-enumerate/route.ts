import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { enumerateSpotifyCollection } from "@/lib/providers/resolve";
import {
  LOCALE_COOKIE,
  dictionaries,
  isLocale,
} from "@/lib/i18n/dictionaries";

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
      { error: "Missing kind (album|playlist) and id parameters." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies().catch(() => null);
  const raw = cookieStore?.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : "fr";
  const t = dictionaries[locale];

  try {
    const enumerated = await enumerateSpotifyCollection(
      kind,
      id,
      kind === "album"
        ? `${t.importView.albumImport} Spotify`
        : `${t.importView.playlistImport} Spotify`
    );
    if (!enumerated || enumerated.items.length === 0) {
      return NextResponse.json(
        { error: t.importView.collectionNotFound },
        { status: 422 }
      );
    }
    return NextResponse.json(enumerated);
  } catch {
    return NextResponse.json(
      { error: t.importView.collectionNotFound },
      { status: 502 }
    );
  }
}
