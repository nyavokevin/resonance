import { NextResponse } from "next/server";
import { detectLink } from "@/lib/detect";
import { resolveLink } from "@/lib/providers/resolve";
import { getServerLocale } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { url?: string }
    | null;

  if (!body?.url) {
    return NextResponse.json({ error: "URL manquante." }, { status: 400 });
  }

  const link = detectLink(body.url);
  if (!link) {
    return NextResponse.json(
      { error: "Plateforme non reconnue. Colle un lien Spotify, YouTube, Apple Music, SoundCloud ou MP3 direct." },
      { status: 400 }
    );
  }

  const result = await resolveLink(link, await getServerLocale());
  if (result.error || result.tracks.length === 0) {
    return NextResponse.json(
      { error: result.error ?? "Lien illisible." },
      { status: 422 }
    );
  }

  return NextResponse.json(result);
}
