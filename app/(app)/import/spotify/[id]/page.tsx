import { getSpotifyAlbum, getSpotifyPlaylistMeta } from "@/lib/providers/spotify-api";
import { SpotifyImportView } from "@/components/SpotifyImportView";

export const dynamic = "force-dynamic";

export default async function SpotifyImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const kind = type === "album" ? "album" : "playlist";

  let title = kind === "album" ? "Album Spotify" : "Playlist Spotify";
  let coverUrl: string | undefined;
  let artist: string | undefined;
  let trackCount: number | undefined;

  if (kind === "album") {
    const album = await getSpotifyAlbum(id).catch(() => null);
    if (album) {
      title = album.name;
      coverUrl = album.coverUrl;
      artist = album.artist;
      trackCount = album.trackCount;
    }
  } else {
    const meta = await getSpotifyPlaylistMeta(id).catch(() => null);
    if (meta) {
      title = meta.name;
      coverUrl = meta.coverUrl;
      artist = meta.owner;
      trackCount = meta.trackCount;
    } else {
      // Repli oembed (sans authentification) si la Web API est down.
      try {
        const res = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(
            `https://open.spotify.com/playlist/${id}`
          )}`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            title?: string;
            thumbnail_url?: string;
          };
          title = data.title ?? title;
          coverUrl = data.thumbnail_url;
        }
      } catch {
        // titre générique conservé
      }
    }
  }

  return (
    <SpotifyImportView
      collectionId={id}
      kind={kind}
      title={title}
      coverUrl={coverUrl}
      artist={artist}
      trackCount={trackCount}
    />
  );
}
