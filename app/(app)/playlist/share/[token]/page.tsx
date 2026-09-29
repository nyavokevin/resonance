import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SharePlaylistView } from "@/components/SharePlaylistView";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ShareRpcRow {
  id: string;
  position: number;
  track: unknown;
  added_at: string;
}

interface ShareRpcPlaylist {
  id: string;
  user_id: string;
  name: string;
  description: string;
  cover_url: string | null;
  is_public: boolean;
  share_token: string | null;
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_playlist_by_share_token", {
    p_token: token,
  });
  const parsed = data as {
    playlist: ShareRpcPlaylist | null;
    tracks: ShareRpcRow[] | null;
  } | null;
  if (error || !parsed?.playlist) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", parsed.playlist.user_id)
    .maybeSingle();

  const rows = (parsed.tracks ?? []).map((t) => ({
    id: t.id,
    position: t.position,
    track: t.track as Track,
    addedAt: t.added_at,
  }));
  const list = rows.map((r) => r.track);

  return (
    <SharePlaylistView
      initial={{
        id: parsed.playlist.id,
        name: parsed.playlist.name,
        description: parsed.playlist.description,
        coverUrl:
          parsed.playlist.cover_url ?? list[0]?.coverUrl,
        isPublic: parsed.playlist.is_public,
        shareToken: parsed.playlist.share_token,
        isOwner: false,
        ownerId: parsed.playlist.user_id,
        tracks: rows,
      }}
      creatorName={profile?.display_name ?? undefined}
    />
  );
}
