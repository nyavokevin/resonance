import { NextResponse } from "next/server";
import { fetchUpNext } from "@/lib/providers/radio";
import type { Track } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId")?.trim();
  if (!videoId) {
    return NextResponse.json({ error: "videoId manquant." }, { status: 400 });
  }
  const exclude = new Set(
    (searchParams.get("exclude") ?? "").split(",").filter(Boolean)
  );

  try {
    const candidates = await fetchUpNext(videoId);
    const tracks: Track[] = candidates
      .filter((c) => !exclude.has(`youtube:track:${c.videoId}`))
      .slice(0, 10)
      .map((c) => ({
        id: `youtube:track:${c.videoId}`,
        platform: "youtube" as const,
        platformTrackId: c.videoId,
        title: c.title,
        artist: c.channel,
        coverUrl: c.thumbnail,
        sourceUrl: `https://www.youtube.com/watch?v=${c.videoId}`,
        durationMs: c.durationMs,
        auto: true,
      }));
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ error: "Radio indisponible." }, { status: 502 });
  }
}
