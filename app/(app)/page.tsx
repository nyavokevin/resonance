import { createClient } from "@/lib/supabase/server";
import { fetchRecentTracks, fetchTrending } from "@/lib/library-server";
import { RecentGrid, TrendRows } from "@/components/TrackList";
import { LastPlayedBanner } from "@/components/LastPlayedBanner";
import { Network } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [recent, trending] = await Promise.all([
    fetchRecentTracks(12).catch(() => []),
    fetchTrending(6).catch(() => []),
  ]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const name = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";
  const lastTrack = recent[0];

  return (
    <>
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-card bg-panel border border-edge text-ink-soft text-[11px] mb-2 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-ok" />
            Passerelle multi-plateformes connectée
          </div>
          <h1 className="font-display text-[24px] font-bold text-white tracking-tight">
            {greeting}, {name}
          </h1>
          <p className="text-ink-soft text-[13px] mt-0.5">
            Écoute tes flux Spotify, YouTube et SoundCloud fusionnés en un seul
            endroit.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-card bg-panel border border-edge w-fit">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
            <Network size={15} className="text-accent" />
            <span>3 services synchronisés</span>
          </div>
        </div>
      </section>

      {lastTrack && <LastPlayedBanner track={lastTrack} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[16px] font-semibold text-white tracking-tight">
            Récemment écouté
          </h2>
        </div>
        <RecentGrid tracks={recent.slice(0, 6)} />
      </section>

      <section className="space-y-2.5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[16px] font-semibold text-white tracking-tight">
            Tendances de ta bibliothèque unifiée
          </h2>
          <span className="text-[11px] text-ink-muted">
            Basé sur ton historique d&apos;écoute
          </span>
        </div>
        <TrendRows tracks={trending} />
      </section>
    </>
  );
}
