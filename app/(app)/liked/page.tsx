import { fetchLiked } from "@/lib/library-server";
import { TrackRows } from "@/components/TrackList";
import { getServerDictionary } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import { Heart } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LikedPage() {
  const { t } = await getServerDictionary();
  const tracks = await fetchLiked().catch(() => []);

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-center gap-4">
        <span className="flex h-24 w-24 items-center justify-center rounded-card bg-gradient-to-br from-accent to-[#8b5cf6]">
          <Heart size={40} fill="white" className="text-white" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {t.liked.playlist}
          </p>
          <h1 className="text-3xl font-semibold text-ink">{t.liked.likedTitles}</h1>
          <p className="mt-1 text-sm text-ink-soft">{fmt(t.common.titlesCount, { n: tracks.length })}</p>
        </div>
      </div>
      <TrackRows tracks={tracks} scrollable />
    </div>
  );
}
