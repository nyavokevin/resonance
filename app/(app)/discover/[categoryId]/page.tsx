import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ListMusic } from "lucide-react";
import {
  getBrowseCategory,
  getCategoryPlaylists,
} from "@/lib/providers/spotify-api";
import { getServerDictionary } from "@/lib/i18n/server";
import { fmt, plural } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function DiscoverCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { t } = await getServerDictionary();
  const { categoryId } = await params;
  const [category, playlists] = await Promise.all([
    getBrowseCategory(categoryId).catch(() => null),
    getCategoryPlaylists(categoryId, 20).catch(() => []),
  ]);
  if (!category) notFound();

  return (
    <div className="pt-2 pb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Link href="/discover" className="hover:text-white transition-colors">
          {t.discover.breadcrumb}
        </Link>
        <ChevronRight size={13} />
        <span className="text-ink-soft">{category.name}</span>
      </nav>

      {/* Header */}
      <header className="mt-3 flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card bg-card border border-edge">
          {category.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ListMusic size={26} className="text-ink-muted" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t.discover.categorySpotify}
          </p>
          <h1 className="mt-0.5 truncate font-display text-[26px] font-bold text-white">
            {category.name}
          </h1>
          <p className="text-[12px] text-ink-muted">
            {fmt(t.discover.publicPlaylists, {
              n: playlists.length,
              s: plural(playlists.length),
            })}
          </p>
        </div>
      </header>

      {/* Grille playlists du genre */}
      {playlists.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink-muted">
          {t.discover.noPlaylists}
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {playlists.map((p) => (
            <Link
              key={p.id}
              href={`/import/spotify/${p.id}?type=playlist`}
              className="group rounded-card bg-card hover:bg-hover border border-edge p-3 transition-colors"
            >
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-base">
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ListMusic size={24} className="text-ink-muted" />
                )}
              </span>
              <span className="mt-2 block truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                {p.name}
              </span>
              {p.description && (
                <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-soft">
                  {p.description}
                </span>
              )}
              <span className="mt-1 block truncate text-[11px] text-ink-muted">
                {p.owner}
                {p.trackCount ? fmt(t.discover.tracksSuffix, { n: p.trackCount }) : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
