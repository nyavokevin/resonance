"use client";

import { createClient } from "@/lib/supabase/client";
import { JAM_STORAGE_KEY, type JamParticipant, type JamPlaybackState, type JamSession, type JamTrackMeta } from "@/lib/jam-store";
import type { Track } from "@/lib/types";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { useLocaleStore } from "@/lib/i18n/locale-store";

export interface JamSessionRow {
  id: string;
  code: string;
  host_id: string;
  current_track: Track | null;
  queue: Track[];
  current_index: number;
  position_ms: number;
  is_playing: boolean;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createJamSession(
  userId: string
): Promise<{ session: JamSessionRow | null; error?: string }> {
  const supabase = createClient();
  const code = generateCode();
  const { data, error } = await supabase
    .from("jam_sessions")
    .insert({
      code,
      host_id: userId,
      queue: [],
      current_index: 0,
      position_ms: 0,
      is_playing: false,
    })
    .select("*")
    .single();
  if (error) {
    const t = dictionaries[useLocaleStore.getState().locale].jamErrors;
    let message = error.message;
    if (error.code === "42703" || message.includes("column")) {
      message = t.missingColumns;
    } else if (error.code === "42501") {
      message = t.rlsDenied;
    }
    return { session: null, error: message };
  }
  return { session: data as JamSessionRow };
}

export async function findJamSessionByCode(
  code: string
): Promise<JamSessionRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("find_jam_session", { p_code: code });
  if (error) return null;
  const row = (data as JamSessionRow[] | null)?.[0];
  return row ?? null;
}

export async function joinJamSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jam_participants")
    .upsert(
      { session_id: sessionId, user_id: userId },
      { onConflict: "session_id,user_id" }
    );
  return !error;
}

export async function leaveJamSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("jam_participants")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);
}

export async function restoreJamSession(
  userId: string
): Promise<JamSession | null> {
  let stored: { id: string; code: string; isHost: boolean } | null = null;
  try {
    const raw = localStorage.getItem(JAM_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored?.id) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("jam_sessions")
    .select("id, code, host_id")
    .eq("id", stored.id)
    .maybeSingle();

  if (!data) {
    try {
      localStorage.removeItem(JAM_STORAGE_KEY);
    } catch {}
    return null;
  }

  const isHost = data.host_id === userId;
  if (!isHost) {
    await joinJamSession(stored.id, userId);
  }

  return { id: data.id, code: data.code, isHost };
}

export async function deleteJamSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("jam_sessions").delete().eq("id", sessionId);
}

export async function fetchParticipants(
  sessionId: string
): Promise<JamParticipant[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("jam_participants")
    .select("user_id, profiles(display_name)")
    .eq("session_id", sessionId);
  return (data ?? []).map((row) => {
    const profile = row.profiles as { display_name?: string } | null;
    return {
      id: row.user_id,
      name:
        profile?.display_name ??
        (useLocaleStore.getState().locale === "en" ? "Guest" : "Invité"),
    };
  });
}

export async function addTrackToJam(
  sessionId: string,
  track: Track
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc("jam_add_track", {
    p_session_id: sessionId,
    p_track: track as unknown as JSON,
  });
  return !error;
}

export async function pushJamState(
  sessionId: string,
  state: JamPlaybackState
): Promise<void> {
  const supabase = createClient();
  const track = state.queue[state.currentIndex] ?? null;
  await supabase
    .from("jam_sessions")
    .update({
      queue: state.queue as unknown as JSON,
      current_index: state.currentIndex,
      position_ms: Math.round(state.positionMs),
      is_playing: state.isPlaying,
      current_track: track ? (track as unknown as JSON) : null,
      repeat_mode: state.repeat,
      repeat_count: state.repeatCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

export async function fetchJamState(
  sessionId: string
): Promise<JamPlaybackState | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("jam_sessions")
    .select(
      "queue, current_index, position_ms, is_playing, repeat_mode, repeat_count, updated_at"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    queue: (data.queue ?? []) as Track[],
    currentIndex: data.current_index ?? 0,
    positionMs: data.position_ms ?? 0,
    isPlaying: data.is_playing ?? false,
    repeat: (data.repeat_mode ?? "off") as JamPlaybackState["repeat"],
    repeatCount: data.repeat_count ?? 0,
    updatedAt: data.updated_at,
  };
}

interface RealtimeRow {
  queue: Track[];
  current_index: number;
  position_ms: number;
  is_playing: boolean;
  repeat_mode?: string;
  repeat_count?: number;
  updated_at: string;
}

interface PresenceMeta {
  name?: string;
  track?: JamTrackMeta | null;
}

export interface JamSignal {
  trackId: string;
  isPlaying: boolean;
  positionMs: number;
  repeat: JamPlaybackState["repeat"];
  repeatCount: number;
  ts: number;
}

export interface JamChannelHandle {
  unsubscribe: () => void;
  sendSignal: (signal: JamSignal) => void;
  updatePresence: (meta: { name: string; track: JamTrackMeta | null }) => void;
}

export function subscribeJam(
  sessionId: string,
  userId: string,
  name: string,
  onState: (state: JamPlaybackState) => void,
  onParticipants: (participants: JamParticipant[]) => void,
  onSignal?: (signal: JamSignal) => void
): JamChannelHandle {
  const supabase = createClient();
  const topic = `jam:${sessionId}`;

  // React StrictMode / restauration de session réutilisent le même topic :
  // ré-attacher des callbacks sur un canal déjà subscribe() jette une erreur.
  const existing = supabase.getChannels().find((c) => c.topic === topic);
  if (existing) {
    void supabase.removeChannel(existing);
  }

  const channel = supabase.channel(topic, {
    config: { presence: { key: userId }, broadcast: { self: false } },
  });

  channel
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "jam_sessions",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as RealtimeRow;
        onState({
          queue: row.queue ?? [],
          currentIndex: row.current_index ?? 0,
          positionMs: row.position_ms ?? 0,
          isPlaying: row.is_playing ?? false,
          repeat: (row.repeat_mode ?? "off") as JamPlaybackState["repeat"],
          repeatCount: row.repeat_count ?? 0,
          updatedAt: row.updated_at,
        });
      }
    )
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceMeta>();
      const participants: JamParticipant[] = [];
      for (const key of Object.keys(state)) {
        const metas = state[key];
        if (metas.length > 0) {
          participants.push({
            id: key,
            name:
              metas[0].name ??
              (useLocaleStore.getState().locale === "en" ? "Guest" : "Invité"),
            track: metas[0].track ?? null,
          });
        }
      }
      onParticipants(participants);
    })
    .on("broadcast", { event: "signal" }, (message) => {
      const payload = (message as { payload?: JamSignal }).payload;
      if (payload && onSignal) onSignal(payload);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ name, track: null });
      }
    });

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
    sendSignal: (signal) => {
      void channel.send({
        type: "broadcast",
        event: "signal",
        payload: signal,
      });
    },
    updatePresence: (meta) => {
      void channel.track(meta);
    },
  };
}
