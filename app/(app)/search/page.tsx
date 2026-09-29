import { fetchRecentTracks } from "@/lib/library-server";
import { SearchView } from "@/components/SearchView";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const recent = await fetchRecentTracks(12).catch(() => []);
  return <SearchView recent={recent} initialQuery={typeof q === "string" ? q : ""} />;
}
