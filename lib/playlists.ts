"use client";

import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/client";
import type { Track } from "@/lib/types";

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  coverUrl?: string;
  trackCount: number;
  durationMs: number;
  isPublic: boolean;
  shareToken: string | null;
  updatedAt: string;
}

export interface PlaylistTrackRow {
  id: string;
  position: number;
  track: Track;
  addedAt: string;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  description: string;
  coverUrl?: string;
  isPublic: boolean;
  shareToken: string | null;
  isOwner: boolean;
  creatorName?: string;
  tracks: PlaylistTrackRow[];
}

interface PlaylistRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  cover_url: string | null;
  is_public: boolean;
  share_token: string | null;
  updated_at: string;
}

interface PlaylistTrackDbRow {
  id: string;
  playlist_id: string;
  position: number;
  track: unknown;
  added_at: string;
}

function toTrack(row: PlaylistTrackDbRow): PlaylistTrackRow {
  return {
    id: row.id,
    position: row.position,
    track: row.track as Track,
    addedAt: row.added_at,
  };
}

export async function fetchPlaylists(): Promise<PlaylistSummary[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  // Owner uniquement : les playlists publiques d'autres users ne
  // s'affichent pas dans la sidebar (accès exclusivement par lien de partage).
  const { data: playlists } = await supabase
    .from("playlists")
    .select("id, name, description, cover_url, is_public, share_token, updated_at")
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

  return (playlists as PlaylistRow[]).map((p) => {
    const list = byPlaylist.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      coverUrl: p.cover_url ?? list[0]?.coverUrl,
      trackCount: list.length,
      durationMs: list.reduce((acc, t) => acc + (t.durationMs ?? 0), 0),
      isPublic: p.is_public,
      shareToken: p.share_token,
      updatedAt: p.updated_at,
    };
  });
}

export async function fetchPlaylistDetail(
  id: string
): Promise<PlaylistDetail | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: playlist } = await supabase
    .from("playlists")
    .select("id, user_id, name, description, cover_url, is_public, share_token")
    .eq("id", id)
    .maybeSingle();
  if (!playlist) return null;

  const { data: tracks } = await supabase
    .from("playlist_tracks")
    .select("id, playlist_id, position, track, added_at")
    .eq("playlist_id", id)
    .order("position", { ascending: true });

  const rows = (tracks ?? []) as PlaylistTrackDbRow[];
  const list = rows.map((r) => r.track as Track);
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    coverUrl: playlist.cover_url ?? list[0]?.coverUrl,
    isPublic: playlist.is_public,
    shareToken: playlist.share_token,
    isOwner: user?.id === playlist.user_id,
    tracks: rows.map(toTrack),
  };
}

export async function createPlaylist(name: string): Promise<PlaylistRow | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !name.trim()) return null;
  const { data, error } = await supabase
    .from("playlists")
    .insert({
      user_id: user.id,
      name: name.trim(),
      share_token: nanoid(10),
    })
    .select("id, user_id, name, description, cover_url, is_public, share_token, updated_at")
    .single();
  if (error) return null;
  return data as PlaylistRow;
}

export async function updatePlaylist(
  id: string,
  patch: { name?: string; description?: string }
): Promise<boolean> {
  const supabase = createClient();
  const update: Record<string, string> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description;
  if (!update.name && update.description === undefined) return false;
  if (update.name !== undefined && !update.name) return false;
  const { error } = await supabase
    .from("playlists")
    .update(update)
    .eq("id", id);
  return !error;
}

export async function duplicatePlaylist(id: string): Promise<PlaylistRow | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: source } = await supabase
    .from("playlists")
    .select("name, description")
    .eq("id", id)
    .maybeSingle();
  if (!source) return null;

  const { data: tracks } = await supabase
    .from("playlist_tracks")
    .select("position, platform, track_id, track")
    .eq("playlist_id", id)
    .order("position", { ascending: true });

  return createPlaylistWithTracks(
    user.id,
    `${source.name} (copie)`,
    source.description,
    (tracks ?? []).map((t) => ({
      position: t.position,
      platform: t.platform,
      track_id: t.track_id,
      track: t.track,
    }))
  );
}

interface TrackInsert {
  position: number;
  platform: string;
  track_id: string;
  track: unknown;
}

async function createPlaylistWithTracks(
  userId: string,
  name: string,
  description: string,
  tracks: TrackInsert[]
): Promise<PlaylistRow | null> {
  const supabase = createClient();
  const { data: created, error: createError } = await supabase
    .from("playlists")
    .insert({
      user_id: userId,
      name,
      description,
      share_token: nanoid(10),
    })
    .select("id, user_id, name, description, cover_url, is_public, share_token, updated_at")
    .single();
  if (createError || !created) return null;

  if (tracks.length) {
    const { error: insertError } = await supabase
      .from("playlist_tracks")
      .insert(
        tracks.map((t) => ({
          playlist_id: created.id,
          position: t.position,
          platform: t.platform,
          track_id: t.track_id,
          track: t.track,
        }))
      );
    if (insertError) {
      await supabase.from("playlists").delete().eq("id", created.id);
      return null;
    }
  }
  return created as PlaylistRow;
}

/** Enregistre une playlist partagée (publique) dans ses propres playlists. */
export async function saveSharedPlaylist(
  name: string,
  description: string,
  tracks: Track[]
): Promise<PlaylistRow | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return createPlaylistWithTracks(
    user.id,
    name,
    description,
    tracks.map((t, i) => ({
      position: i,
      platform: t.platform,
      track_id: t.platformTrackId,
      track: t as unknown as JSON,
    }))
  );
}

export async function deletePlaylist(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("playlists").delete().eq("id", id);
  return !error;
}

export async function addTrackToPlaylist(
  playlistId: string,
  track: Track
): Promise<boolean> {
  return addTracksToPlaylist(playlistId, [track]);
}

/**
 * Ajout en batch (un SELECT max + un INSERT) : utilisé quand une
 * collection entière est ajoutée à une playlist personnelle.
 */
export async function addTracksToPlaylist(
  playlistId: string,
  tracks: Track[]
): Promise<boolean> {
  if (tracks.length === 0) return true;
  const supabase = createClient();
  const { data: last } = await supabase
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;
  const { error } = await supabase.from("playlist_tracks").insert(
    tracks.map((track, i) => ({
      playlist_id: playlistId,
      position: start + i,
      platform: track.platform,
      track_id: track.platformTrackId,
      track: track as unknown as JSON,
    }))
  );
  return !error;
}

export async function removeTracksFromPlaylist(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const supabase = createClient();
  const { error } = await supabase
    .from("playlist_tracks")
    .delete()
    .in("id", ids);
  return !error;
}

export async function reorderPlaylist(
  playlistId: string,
  orderedIds: string[]
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reorder_playlist_tracks", {
    p_playlist_id: playlistId,
    p_ordered_ids: orderedIds,
  });
  return !error;
}

/** Map playlistId → playlistTrackId pour un morceau déjà présent. */
export async function findTrackInPlaylists(
  track: Track
): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data: playlists } = await supabase
    .from("playlists")
    .select("id");
  if (!playlists?.length) return new Map();
  const { data: rows } = await supabase
    .from("playlist_tracks")
    .select("id, playlist_id")
    .in(
      "playlist_id",
      playlists.map((p) => p.id)
    )
    .eq("platform", track.platform)
    .eq("track_id", track.platformTrackId);
  return new Map((rows ?? []).map((r) => [r.playlist_id, r.id]));
}

export async function togglePlaylistPublic(
  id: string,
  isPublic: boolean
): Promise<boolean> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { is_public: isPublic };
  if (isPublic) {
    const { data: row } = await supabase
      .from("playlists")
      .select("share_token")
      .eq("id", id)
      .maybeSingle();
    if (row && !row.share_token) patch.share_token = nanoid(10);
  }
  const { error } = await supabase.from("playlists").update(patch).eq("id", id);
  return !error;
}

export async function regenerateShareToken(id: string): Promise<string | null> {
  const supabase = createClient();
  const token = nanoid(10);
  const { error } = await supabase
    .from("playlists")
    .update({ share_token: token })
    .eq("id", id);
  return error ? null : token;
}

export interface SharedPlaylist {
  playlist: PlaylistRow & { creator_name?: string };
  tracks: PlaylistTrackRow[];
}

export async function getSharedPlaylist(
  token: string
): Promise<SharedPlaylist | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_playlist_by_share_token", {
    p_token: token,
  });
  if (error || !data) return null;
  const parsed = data as {
    playlist: PlaylistRow & { creator_name?: string };
    tracks: Array<{
      id: string;
      position: number;
      track: unknown;
      added_at: string;
    }>;
  };
  if (!parsed.playlist) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", (parsed.playlist as PlaylistRow & { user_id: string }).user_id)
    .maybeSingle();
  return {
    playlist: {
      ...parsed.playlist,
      creator_name: profile?.display_name ?? undefined,
    },
    tracks: (parsed.tracks ?? []).map((t) => ({
      id: t.id,
      position: t.position,
      track: t.track as Track,
      addedAt: t.added_at,
    })),
  };
}
