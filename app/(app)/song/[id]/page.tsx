import { notFound } from "next/navigation";
import type { DetectedLink } from "@/lib/detect";
import { resolveLink } from "@/lib/providers/resolve";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from "@/lib/types";
import { SongActions } from "@/components/SongActions";
import { formatDuration } from "@/components/TrackList";
import { getServerDictionary } from "@/lib/i18n/server";
import { Link2, Music2 } from "lucide-react";

export const dynamic = "force-dynamic";

function buildLink(platform: Platform, trackId: string): DetectedLink | null {
  switch (platform) {
    case "youtube":
      return { platform, kind: "track", id: trackId, url: `https://www.youtube.com/watch?v=${trackId}` };
    case "youtube-music":
      return { platform, kind: "track", id: trackId, url: `https://music.youtube.com/watch?v=${trackId}` };
    case "spotify":
      return { platform, kind: "track", id: trackId, url: `https://open.spotify.com/track/${trackId}` };
    case "apple-music":
      return { platform, kind: "track", id: trackId, url: `https://music.apple.com/fr/album/x?i=${trackId}` };
    case "soundcloud":
      return { platform, kind: "track", id: trackId, url: `https://soundcloud.com/${trackId}` };
    default:
      return null;
  }
}

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { t, locale } = await getServerDictionary();
  const trackId = decodeURIComponent(rawId);
  const parts = trackId.split(":");
  if (parts.length < 3) notFound();

  const platform = parts[0] as Platform;
  const platformTrackId = parts.slice(2).join(":");
  const link = buildLink(platform, platformTrackId);
  if (!link) notFound();

  const result = await resolveLink(link, locale);
  const track = result.tracks[0];
  if (!track) notFound();

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="w-40 h-40 shrink-0 rounded-card bg-card border border-edge overflow-hidden flex items-center justify-center">
          {track.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music2 size={40} className="text-ink-muted" />
          )}
        </div>
        <div className="flex flex-col min-w-0 justify-end gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {t.song.trackLabel}
          </span>
          <h1 className="font-display text-[26px] font-bold text-white leading-tight break-words">
            {track.title}
          </h1>
          <div className="flex items-center gap-2.5 mt-1">
            <span
              className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded text-white"
              style={{ background: PLATFORM_COLORS[track.platform] }}
            >
              {PLATFORM_LABELS[track.platform]}
            </span>
            <span className="text-[13px] text-ink-soft truncate">{track.artist}</span>
            {track.durationMs && (
              <span className="text-[12px] text-ink-muted font-mono">
                {formatDuration(track.durationMs)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SongActions track={track} />
      </div>

      {track.sourceUrl && (
        <a
          href={track.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-white transition-colors"
        >
          <Link2 size={14} />
          {t.song.openSource}
        </a>
      )}
    </div>
  );
}
