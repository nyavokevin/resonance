"use client";

import { createClient } from "@/lib/supabase/client";
import type { Track } from "@/lib/types";

export async function isLiked(track: Track): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("liked_tracks")
    .select("id")
    .eq("platform", track.platform)
    .eq("platform_track_id", track.platformTrackId)
    .maybeSingle();
  return Boolean(data);
}

export async function toggleLike(track: Track): Promise<boolean | null> {
  const supabase = createClient();
  const existing = await supabase
    .from("liked_tracks")
    .select("id")
    .eq("platform", track.platform)
    .eq("platform_track_id", track.platformTrackId)
    .maybeSingle();

  if (existing.data) {
    await supabase.from("liked_tracks").delete().eq("id", existing.data.id);
    return false;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("liked_tracks").insert({
    user_id: user.id,
    platform: track.platform,
    platform_track_id: track.platformTrackId,
    title: track.title,
    artist: track.artist,
    cover_url: track.coverUrl ?? null,
    source_url: track.sourceUrl,
    duration_ms: track.durationMs ?? null,
  });
  if (error) return false;
  return true;
}

export async function recordHistory(track: Track) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("history_entries")
      .insert({ user_id: user.id, track: track as unknown as JSON });
  } catch {
    // hors ligne ou non connecté : on ignore
  }
}

/** Ids des morceaux écoutés récemment (client, pour l'exclusion radio). */
export async function fetchRecentTrackIds(limit = 20): Promise<string[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("history_entries")
      .select("track")
      .order("played_at", { ascending: false })
      .limit(limit);
    const ids: string[] = [];
    for (const row of data ?? []) {
      const id = (row.track as unknown as Track)?.id;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export interface QueueState {
  items: Track[];
  currentIndex: number;
  positionMs: number;
  isPlaying: boolean;
  volume: number;
  repeat: "off" | "all" | "one" | "times";
  repeatCount: number;
  autoplay: boolean;
  shuffle: boolean;
}

export async function saveQueueState(state: QueueState) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const payload = {
    user_id: user.id,
    items: state.items as unknown as JSON,
    current_index: state.currentIndex,
    position_ms: Math.round(state.positionMs),
    is_playing: state.isPlaying,
    volume: state.volume,
    repeat_mode: state.repeat,
    repeat_count: state.repeatCount,
    autoplay: state.autoplay,
    shuffle: state.shuffle,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("queue_state")
    .upsert(payload, { onConflict: "user_id" });
  // Base sans la migration 003 : on réessaie sans les nouvelles colonnes
  // pour ne pas casser la reprise de file existante.
  if (error && /repeat_count|autoplay/.test(error.message)) {
    const legacy: Record<string, unknown> = { ...payload };
    delete legacy.repeat_count;
    delete legacy.autoplay;
    await supabase
      .from("queue_state")
      .upsert(legacy, { onConflict: "user_id" });
  }
}

export async function loadQueueState(): Promise<QueueState | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("queue_state")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || !data.items?.length) return null;
  return {
    items: data.items as Track[],
    currentIndex: data.current_index,
    positionMs: data.position_ms,
    isPlaying: data.is_playing,
    volume: data.volume,
    repeat: data.repeat_mode,
    repeatCount: data.repeat_count ?? 0,
    autoplay: data.autoplay ?? true,
    shuffle: data.shuffle,
  };
}
