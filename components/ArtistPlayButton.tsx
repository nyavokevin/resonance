"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { useToasts } from "@/lib/toast-store";
import type { Track } from "@/lib/types";
import type { SpotifySearchTrack } from "@/lib/providers/spotify-api";

/**
 * ▶ sur une page artiste : top titres (search Spotify) → pipeline
 * de résolution jouable (ISRC → YouTube) → lecture.
 * (artists/{id}/top-tracks ne répond pas en Client Credentials,
 * la recherche restreinte à l'artiste est l'équivalent fiable.)
 */
export function ArtistPlayButton({ artistName }: { artistName: string }) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const playTrack = usePlayer((s) => s.playTrack);
  const [busy, setBusy] = useState(false);

  async function resolveOne(t: SpotifySearchTrack): Promise<Track | null> {
    try {
      const res = await fetch("/api/resolve-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "spotify",
          trackId: t.spotifyId,
          isrc: t.isrc,
          title: t.title,
          artist: t.artists,
          durationMs: t.durationMs,
          album: t.album,
          coverUrl: t.coverUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.track) throw new Error();
      return data.track as Track;
    } catch {
      return null;
    }
  }

  async function handlePlay() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/search?${new URLSearchParams({ q: artistName, type: "track", limit: "8" }).toString()}`
      );
      const data = await res.json();
      if (!res.ok || data.source !== "spotify" || !data.tracks?.length) {
        push("Lecture impossible pour cet artiste.", "error");
        return;
      }
      const candidates = (data.tracks as SpotifySearchTrack[]).slice(0, 8);
      const resolved: Track[] = [];
      for (let i = 0; i < candidates.length; i += 3) {
        const out = await Promise.all(
          candidates.slice(i, i + 3).map((t) => resolveOne(t))
        );
        resolved.push(...out.filter((t): t is Track => t !== null));
      }
      if (!resolved.length) {
        push("Titres illisibles.", "error");
        return;
      }
      await playTrack(resolved[0], resolved);
      const missing = candidates.length - resolved.length;
      push(
        missing > 0
          ? `Écoute : ${artistName} — ${resolved.length}/${candidates.length} titres résolus (${missing} introuvable${missing > 1 ? "s" : ""} ⚠)`
          : `Écoute : ${artistName} — ${resolved.length}/${candidates.length} titres résolus ✓`,
        missing > 0 ? "info" : "success"
      );
      router.refresh();
    } catch {
      push("Lecture impossible.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void handlePlay()}
      disabled={busy}
      className="mt-3 inline-flex items-center gap-1.5 px-5 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
      <span>{busy ? "Chargement…" : "Écouter"}</span>
    </button>
  );
}
