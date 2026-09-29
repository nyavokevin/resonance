import {
  fetchRecentTracks,
  fetchTopArtists,
  fetchGlobalTrending,
  fetchForgottenLikes,
} from "@/lib/library-server";
import { clearBrowseCache } from "@/lib/providers/spotify-api";
import {
  getBrowseCategories,
  getFeaturedPlaylists,
  getNewReleases,
} from "@/lib/providers/spotify-api";
import { DiscoverView } from "@/components/DiscoverView";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string }>;
}) {
  const { refresh } = await searchParams;
  // Bouton ↻ : vide le cache browse 15min avant de recharger.
  if (refresh) clearBrowseCache();

  const [recent, topArtists, globalTrending, forgotten, categories, featured, newReleases] =
    await Promise.all([
      fetchRecentTracks(20).catch(() => []),
      fetchTopArtists(5).catch(() => []),
      fetchGlobalTrending(10).catch(() => []),
      fetchForgottenLikes().catch(() => []),
      getBrowseCategories(50).catch(() => []),
      getFeaturedPlaylists(10).catch(() => []),
      getNewReleases(10).catch(() => []),
    ]);

  return (
    <DiscoverView
      recent={recent}
      topArtists={topArtists}
      globalTrending={globalTrending}
      forgotten={forgotten}
      categories={categories}
      featured={featured}
      newReleases={newReleases}
    />
  );
}

export const metadata = {
  title: "Découvrir — Resonance",
};
