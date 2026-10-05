"use client";

import { createClient } from "@/lib/supabase/client";
import { JAM_STORAGE_KEY, type JamParticipant, type JamPlaybackState, type JamSession, type JamTrackMeta } from "@/lib/jam-store";
import { fetchProfilesByIds } from "@/lib/friends";
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

/**
 * Join direct par invitation (carte jam_invite / notification) : invite =
 * pré-approbation par le host, donc AUCUN parcours de demande. Vérifie que
 * la session existe encore, ajoute le participant et remplit le store Jam
 * (même setter que le host après create) pour que /jam rende la session
 * live — sans ça, un router.push('/jam') seul tombait sur l'écran de
 * création (restoreJamSession ne lit que le localStorage, jamais rempli
 * ici). Rend null si session terminée/introuvable (l'appelant affiche
 * t.jam.sessionNotFound et ne navigue pas).
 */
export async function joinInvitedSession(
  sessionId: string,
  userId: string
): Promise<JamSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jam_sessions")
    .select("id, code, host_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) {
    console.warn(
      `[jam] joinInvitedSession: session ${sessionId} not found or unreadable`
    );
    return null;
  }
  const ok = await joinJamSession(sessionId, userId);
  if (!ok) {
    console.warn(`[jam] joinInvitedSession: could not add participant ${userId}`);
    return null;
  }
  const joined: JamSession = {
    id: data.id,
    code: data.code,
    isHost: data.host_id === userId,
  };
  // Même setter que le host après create : le store doit détenir la session
  // AVANT navigation pour que /jam affiche participants/tracks.
  const { useJam } = await import("@/lib/jam-store");
  useJam.getState().setSession(joined);
  return joined;
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

// ========== JOIN REQUESTS (migration 010) ==========
// Nouveau régime : un guest demande, le host accepte/refuse. Le join
// instantané direct (joinJamSession) ne reste que pour les invités explicites
// (carte jam_invite), la restauration de session — et le repli legacy quand
// 010 n'est pas appliquée (voir isJoinRequestsAvailable).

/**
 * La migration 010 est-elle appliquée ? Détecté à l'usage : un appel RPC /
 * table manquant (fonction 42883, table 42P01) bascule à false, un appel
 * réussi à true, null = pas encore tenté. Les appelants s'en servent pour
 * retomber sur le join direct legacy plutôt que laisser un bouton mort.
 */
let joinRequestsSupported: boolean | null = null;

export function isJoinRequestsSupported(): boolean | null {
  return joinRequestsSupported;
}

/** Erreur "objet absent" (migration 010 non appliquée) ? */
export function isMissingJoinRequestsError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (code === "42883" || code === "42P01" || code === "PGRST202") return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" && /jam_join_requests|request_jam_join/i.test(message)
  );
}

export type JoinRequestStatus = "pending" | "accepted" | "declined";

export interface JoinRequestRow {
  session_id: string;
  user_id: string;
  status: JoinRequestStatus;
  created_at: string;
}

export interface JamJoinRequest extends JoinRequestRow {
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

/** Demande à rejoindre (idempotent : renvoie la ligne, même si déjà pending/accepted). */
export async function requestToJoin(
  sessionId: string
): Promise<JoinRequestRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("request_jam_join", {
    p_session_id: sessionId,
  });
  if (error || !data) {
    if (error && isMissingJoinRequestsError(error)) {
      joinRequestsSupported = false;
      console.warn(
        "[jam] join requests unavailable (migration 010 not applied?) — callers should fall back to direct join"
      );
    }
    return null;
  }
  joinRequestsSupported = true;
  return data as JoinRequestRow;
}

/** Demandes en attente d'une session (host) + profil du demandeur. */
export async function listJoinRequests(
  sessionId: string
): Promise<JamJoinRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jam_join_requests")
    .select("session_id, user_id, status, created_at")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as JoinRequestRow[];
  if (rows.length === 0) return [];
  // Repli sans colonne email intégré (009 non appliquée) — voir friends.ts.
  const byId = await fetchProfilesByIds(
    supabase,
    rows.map((r) => r.user_id)
  );
  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return {
      ...r,
      profile: p
        ? {
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            email: p.email ?? null,
          }
        : null,
    };
  });
}

/** Acceptation host (pending → accepted + ajout participant, atomique côté serveur). */
export async function approveJoinRequest(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("approve_jam_join_request", {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) return false;
  return data === true;
}

/** Refus host (pending → declined, terminal). */
export async function declineJoinRequest(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("decline_jam_join_request", {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) return false;
  return data === true;
}

/**
 * Retrait par le guest (DELETE own — choix documenté : plus simple qu'un
 * état `cancelled`, le host n'a plus rien à voir). Le refus host, lui,
 * reste en ligne `declined` (pas de DELETE).
 */
export async function cancelJoinRequest(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jam_join_requests")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  return !error;
}

/**
 * Temps réel des demandes d'une session (StrictMode-safe, même idiome que
 * subscribeConversation). Le RLS filtre : le host reçoit tout (INSERT +
 * UPDATE + DELETE), le guest seulement sa propre ligne. `null` = ligne
 * supprimée (retrait guest) — à ignorer côté décision, le host refetche.
 */
export function subscribeJoinRequests(
  sessionId: string,
  onChange: (row: JoinRequestRow | null) => void
): () => void {
  const supabase = createClient();
  const topic = `jam:${sessionId}:requests`;

  const existing = supabase.getChannels().find((c) => c.topic === topic);
  if (existing) {
    void supabase.removeChannel(existing);
  }

  const channel = supabase.channel(topic);
  const emit = (row: unknown) => onChange(row as JoinRequestRow);
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "jam_join_requests",
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => emit(payload.new)
  );
  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "jam_join_requests",
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => emit(payload.new)
  );
  channel.on(
    "postgres_changes",
    {
      event: "DELETE",
      schema: "public",
      table: "jam_join_requests",
      filter: `session_id=eq.${sessionId}`,
    },
    () => onChange(null)
  );
  void channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
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
