import Link from "next/link";
import { notFound } from "next/navigation";
import { Disc, Music2 } from "lucide-react";
import { getSpotifyArtist, getArtistAlbums } from "@/lib/providers/spotify-api";
import { ArtistPlayButton } from "@/components/ArtistPlayButton";
import { PLATFORM_COLORS } from "@/lib/types";
import { getServerDictionary } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

function formatFollowers(n: number | undefined, locale: Locale): string {
  if (n === undefined) return "";
  return new Intl.NumberFormat(locale, { notation: "compact" }).format(n);
}

export default async function SpotifyArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getServerDictionary();
  const { id } = await params;
  const [artist, albums] = await Promise.all([
    getSpotifyArtist(id).catch(() => null),
    getArtistAlbums(id).catch(() => []),
  ]);
  if (!artist) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-5">
        <span className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card border border-edge">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 size={32} className="text-ink-muted" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {t.artistPage.artistLabel}
            </p>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
              style={{ background: PLATFORM_COLORS.spotify }}
            >
              Spotify
            </span>
          </div>
          <h1 className="mt-1 truncate font-display text-[26px] font-bold text-white">
            {artist.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {artist.followers !== undefined
              ? fmt(t.artistPage.followers, {
                  n: formatFollowers(artist.followers, locale),
                })
              : t.artistPage.followersUnknown}
            {artist.genres && artist.genres.length > 0
              ? ` · ${artist.genres.slice(0, 3).join(", ")}`
              : ""}
          </p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {t.artistPage.topUnavailable}
          </p>
          <ArtistPlayButton artistName={artist.name} />
        </div>
      </div>

      <h2 className="mt-8 mb-3 font-display text-[16px] font-semibold text-white">
        {t.artistPage.albums}
      </h2>
      {albums.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{t.artistPage.noAlbums}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {albums.map((album) => (
            <Link
              key={album.id}
              href={`/import/spotify/${album.id}?type=album`}
              className="group rounded-card border border-edge bg-card p-3 transition-colors hover:bg-hover"
            >
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-card bg-base">
                {album.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={album.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Disc size={28} className="text-ink-muted" />
                )}
              </span>
              <span className="mt-2 block truncate text-[13px] font-medium text-ink group-hover:text-accent transition-colors">
                {album.name}
              </span>
              <span className="block truncate text-[12px] text-ink-soft">
                {album.releaseDate ? `${album.releaseDate.slice(0, 4)} · ` : ""}
                {fmt(t.common.titlesCount, { n: album.trackCount ?? "?" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
