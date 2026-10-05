import {
  fetchRecentTracks,
  fetchTopArtists,
  fetchGlobalTrending,
  fetchForgottenLikes,
} from "@/lib/library-server";
import { clearBrowseCache, fallbackBrowseCategories } from "@/lib/providers/spotify-api";
import {
  getBrowseCategoriesWithFallback,
  getFeaturedPlaylists,
  getNewReleases,
} from "@/lib/providers/spotify-api";
import { DiscoverView } from "@/components/DiscoverView";
import { getServerDictionary } from "@/lib/i18n/server";

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
      // Repli statique intégré : la grille des genres n'est jamais vide.
      getBrowseCategoriesWithFallback(50).catch(() => fallbackBrowseCategories),
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

export async function generateMetadata() {
  const { t } = await getServerDictionary();
  return { title: t.discover.metaTitle };
}
