import { fetchLiked } from "@/lib/library-server";
import { TrackRows } from "@/components/TrackList";
import { Heart } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LikedPage() {
  const tracks = await fetchLiked().catch(() => []);

  return (
    <div className="pt-2">
      <div className="flex items-center gap-4">
        <span className="flex h-24 w-24 items-center justify-center rounded-card bg-gradient-to-br from-accent to-[#8b5cf6]">
          <Heart size={40} fill="white" className="text-white" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Playlist
          </p>
          <h1 className="text-3xl font-semibold text-ink">Titres aimés</h1>
          <p className="mt-1 text-sm text-ink-soft">{tracks.length} titres</p>
        </div>
      </div>
      <TrackRows tracks={tracks} />
    </div>
  );
}
