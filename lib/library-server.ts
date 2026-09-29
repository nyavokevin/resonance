import { createClient } from "@/lib/supabase/server";
import type { Platform, Track } from "@/lib/types";
import type { PlaylistDetail } from "@/lib/playlists";

interface LikedRow {
  id: string;
  platform: Platform;
  platform_track_id: string;
  title: string;
  artist: string;
  cover_url: string | null;
  source_url: string;
  duration_ms: number | null;
  added_at: string;
}

function toTrack(row: LikedRow): Track {
  return {
    id: `${row.platform}:track:${row.platform_track_id}`,
    platform: row.platform,
    platformTrackId: row.platform_track_id,
    title: row.title,
    artist: row.artist,
    coverUrl: row.cover_url ?? undefined,
    sourceUrl: row.source_url,
    durationMs: row.duration_ms ?? undefined,
  };
}

export async function fetchLiked(): Promise<Track[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("liked_tracks")
    .select("*")
    .order("added_at", { ascending: false });
  return (data ?? []).map(toTrack);
}

export async function fetchRecentTracks(limit = 12): Promise<Track[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("history_entries")
    .select("track, played_at")
    .order("played_at", { ascending: false })
    .limit(limit);
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const row of data ?? []) {
    const track = row.track as unknown as Track;
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks;
}

/** Artistes les plus joués (base des mixes Découvrir). */
export async function fetchTopArtists(limit = 5): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("history_entries")
    .select("track")
    .order("played_at", { ascending: false })
    .limit(150);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const artist = (row.track as unknown as Track)?.artist;
    if (!artist) continue;
    counts.set(artist, (counts.get(artist) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/** Tendances globales (RPC agrégée, stats anonymes). */
export async function fetchGlobalTrending(limit = 10): Promise<Track[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_global_trending", {
    p_limit: limit,
  });
  if (!data) return [];
  return (data as Array<{ track: Track; plays: number }>)
    .filter((r) => r?.track?.id)
    .map((r) => r.track);
}

/** Titres aimés non réécoutés récemment (réécoute des classiques). */
export async function fetchForgottenLikes(
  recentLimit = 150
): Promise<Track[]> {
  const supabase = await createClient();
  const [{ data: liked }, { data: history }] = await Promise.all([
    supabase
      .from("liked_tracks")
      .select("platform, platform_track_id, title, artist, cover_url, source_url, duration_ms")
      .order("added_at", { ascending: false })
      .limit(60),
    supabase
      .from("history_entries")
      .select("track")
      .order("played_at", { ascending: false })
      .limit(recentLimit),
  ]);
  const recentIds = new Set(
    (history ?? []).map((r) => (r.track as unknown as Track)?.id).filter(Boolean)
  );
  return (liked ?? [])
    .map((row) => ({
      id: `${row.platform}:track:${row.platform_track_id}`,
      platform: row.platform as Platform,
      platformTrackId: row.platform_track_id,
      title: row.title,
      artist: row.artist,
      coverUrl: row.cover_url ?? undefined,
      sourceUrl: row.source_url,
      durationMs: row.duration_ms ?? undefined,
    }))
    .filter((t) => !recentIds.has(t.id));
}

/** Tendances globales (RPC agrégée, stats anonymes). */
export async function fetchTrending(limit = 6): Promise<Track[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("history_entries")
    .select("track")
    .order("played_at", { ascending: false })
    .limit(150);

  const counts = new Map<string, { track: Track; count: number }>();
  for (const row of data ?? []) {
    const track = row.track as unknown as Track;
    if (!track?.id) continue;
    const entry = counts.get(track.id);
    if (entry) entry.count += 1;
    else counts.set(track.id, { track, count: 1 });
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((e) => e.track);
}

export interface PlaylistSummaryServer {
  id: string;
  name: string;
  coverUrl?: string;
  trackCount: number;
}

/** Résumés pour la sidebar (serveur, via RLS) — owner uniquement. */
export async function fetchPlaylists(): Promise<PlaylistSummaryServer[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: playlists } = await supabase
    .from("playlists")
    .select("id, name, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (!playlists?.length) return [];

  const ids = playlists.map((p) => p.id);
  const { data: tracks } = await supabase
    .from("playlist_tracks")
    .select("playlist_id, position, track")
    .in("playlist_id", ids)
    .order("position", { ascending: true });

  const byPlaylist = new Map<string, Track[]>();
  for (const row of tracks ?? []) {
    const list = byPlaylist.get(row.playlist_id) ?? [];
    list.push(row.track as Track);
    byPlaylist.set(row.playlist_id, list);
  }

  return playlists.map((p) => {
    const list = byPlaylist.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      coverUrl: list[0]?.coverUrl,
      trackCount: list.length,
    };
  });
}

/**
 * Playlist complète avec vérification owner-ou-public.
 * Retourne null → la page répond 404.
 */
export async function fetchPlaylist(
  id: string
): Promise<(PlaylistDetail & { ownerId: string }) | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: playlist } = await supabase
    .from("playlists")
    .select("id, user_id, name, description, cover_url, is_public, share_token")
    .eq("id", id)
    .maybeSingle();
  if (!playlist) return null;
  if (playlist.user_id !== user.id && !playlist.is_public) return null;

  const { data: tracks } = await supabase
    .from("playlist_tracks")
    .select("id, playlist_id, position, track, added_at")
    .eq("playlist_id", id)
    .order("position", { ascending: true });

  const rows = (tracks ?? []) as Array<{
    id: string;
    position: number;
    track: unknown;
    added_at: string;
  }>;
  const list = rows.map((r) => r.track as Track);
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    coverUrl: playlist.cover_url ?? list[0]?.coverUrl,
    isPublic: playlist.is_public,
    shareToken: playlist.share_token,
    isOwner: playlist.user_id === user.id,
    ownerId: playlist.user_id,
    tracks: rows.map((r) => ({
      id: r.id,
      position: r.position,
      track: r.track as Track,
      addedAt: r.added_at,
    })),
  };
}
