import { NextResponse } from "next/server";
import { resolveTrack } from "@/lib/resolve-track";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    platform?: "spotify";
    trackId?: string;
    isrc?: string;
    title?: string;
    artist?: string;
    durationMs?: number;
    album?: string;
    coverUrl?: string;
  } | null;

  if (!body?.title || !body?.artist) {
    return NextResponse.json(
      { error: "Titre et artiste requis." },
      { status: 400 }
    );
  }

  try {
    const result = await resolveTrack({
      platform: body.platform,
      trackId: body.trackId,
      isrc: body.isrc,
      title: body.title,
      artist: body.artist,
      durationMs: body.durationMs,
      album: body.album,
      coverUrl: body.coverUrl,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Titre introuvable." },
      { status: 422 }
    );
  }
}
