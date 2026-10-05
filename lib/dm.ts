"use client";

import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/social";
import { fetchProfilesByIds, type FriendProfile } from "@/lib/friends";
import type { Track } from "@/lib/types";
import { useLocaleStore } from "@/lib/i18n/locale-store";

export interface ConversationPreview {
  conversation: Conversation;
  otherId: string;
  profile: FriendProfile | null;
  lastMessage: Message | null;
  unread: number;
}

async function getSelf() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

async function fetchProfiles(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<Map<string, FriendProfile>> {
  // Repli sans colonne email intégré (009 non appliquée) — voir friends.ts.
  return fetchProfilesByIds(supabase, ids);
}

/**
 * Id de l'autre participant (user_a/user_b ≠ soi). Les colonnes sont
 * ordonnées (user_a < user_b), donc on ne peut pas deviner par position.
 */
export function getPeerId(
  conversation: Pick<Conversation, "user_a_id" | "user_b_id">,
  selfId: string
): string {
  return conversation.user_a_id === selfId
    ? conversation.user_b_id
    : conversation.user_a_id;
}

/** Ouvre (ou récupère) la conversation 1-1 avec un ami. */
export async function startConversation(otherId: string): Promise<Conversation | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_conversation", { other: otherId });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Conversation | undefined;
  return row ?? null;
}

/** Une conversation + le profil de l'autre côté (null si accès refusé). */
export async function getConversation(
  convId: string
): Promise<{ conversation: Conversation; otherId: string; profile: FriendProfile | null } | null> {
  const { supabase, userId } = await getSelf();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", convId)
    .maybeSingle();
  if (error || !data) return null;
  const conversation = data as Conversation;
  if (conversation.user_a_id !== userId && conversation.user_b_id !== userId) return null;
  const otherId = getPeerId(conversation, userId);
  const profiles = await fetchProfiles(supabase, [otherId]);
  return { conversation, otherId, profile: profiles.get(otherId) ?? null };
}

const INBOX_MESSAGE_CAP = 200;

/** Inbox : conversations + profil autre + dernier message + non-lus, triées last_message_at desc. */
export async function listConversations(): Promise<ConversationPreview[]> {
  const { supabase, userId } = await getSelf();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) return [];
  const convs = (data ?? []) as Conversation[];
  if (convs.length === 0) return [];

  const ids = convs.map((c) => c.id);
  const otherIds = convs.map((c) => getPeerId(c, userId));
  const [profiles, { data: recent }] = await Promise.all([
    fetchProfiles(supabase, otherIds),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, type, read_at, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(INBOX_MESSAGE_CAP),
  ]);
  const rows = (recent ?? []) as Message[];

  return convs.map((conversation) => {
    const otherId = getPeerId(conversation, userId);
    const inConv = rows.filter((m) => m.conversation_id === conversation.id);
    return {
      conversation,
      otherId,
      profile: profiles.get(otherId) ?? null,
      lastMessage: inConv[0] ?? null,
      unread: inConv.filter((m) => m.sender_id !== userId && m.read_at === null).length,
    };
  });
}

/** Messages d'une conversation, ordre created desc (plus récent d'abord), paginés. */
export async function getMessages(
  convId: string,
  before?: string,
  limit = 30
): Promise<Message[]> {
  const supabase = createClient();
  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) return [];
  // Durcit à la frontière : payload NULL → {} pour tous les lecteurs aval.
  return ((data ?? []) as Message[]).map((m) => ({
    ...m,
    payload: richPayload(m),
  }));
}

/**
 * Payload toujours-objet : les vieilles lignes (pré-payload) ou inserts
 * NULL n'ont pas d'objet — tout lecteur direct planterait dessus.
 */
export function richPayload(m: {
  payload?: unknown;
}): Record<string, unknown> {
  const p = (m as { payload?: unknown }).payload;
  return typeof p === "object" && p !== null
    ? (p as Record<string, unknown>)
    : {};
}

/** track_share affichable en carte (005 exige platform/track_id) ? Sinon bulle texte. */
export function hasShareTarget(m: Message): boolean {
  const p = richPayload(m);
  return (
    typeof p.platform === "string" &&
    p.platform !== "" &&
    typeof p.track_id === "string" &&
    p.track_id !== ""
  );
}

/** jam_invite affichable en carte ? Sinon bulle texte. */
export function hasJamTarget(m: Message): boolean {
  const p = richPayload(m);
  return typeof p.jam_id === "string" && p.jam_id !== "";
}

/** Texte d'aperçu inbox : libellé riche pour track_share/jam_invite, contenu sinon. */
export function messagePreview(m: Message): string {
  if (m.type === "track_share") {
    const p = richPayload(m);
    const title =
      typeof p.title === "string" && p.title ? p.title : m.content;
    const artist = typeof p.artist === "string" ? p.artist : "";
    return artist ? `🎵 ${title} — ${artist}` : `🎵 ${title}`;
  }
  if (m.type === "jam_invite") {
    const p = richPayload(m);
    const host =
      typeof p.host_name === "string" && p.host_name ? p.host_name : "?";
    return useLocaleStore.getState().locale === "en" ? `🎧 ${host}'s Jam` : `🎧 Jam de ${host}`;
  }
  return m.content;
}

/** Envoie un message texte. Validation client 1..2000 aussi. */
export async function sendText(
  convId: string,
  content: string
): Promise<{ ok: boolean; message?: Message; invalid?: boolean }> {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) return { ok: false, invalid: true };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("send_message", {
    conv: convId,
    p_content: trimmed,
    p_type: "text",
    p_payload: {},
  });
  if (error || !data) return { ok: false };
  const row = (Array.isArray(data) ? data[0] : data) as Message | undefined;
  if (!row) return { ok: false };
  return { ok: true, message: row };
}

/** Partage un titre (track_share). Le payload suit les clés exigées par 005. */
export async function shareTrack(
  convId: string,
  {
    platform,
    trackId,
    title,
    artist,
    cover,
  }: {
    platform: string;
    trackId: string;
    title: string;
    artist: string;
    cover?: string | null;
  }
): Promise<{ ok: boolean; message?: Message }> {
  if (!platform || !trackId || !title.trim() || !artist.trim()) return { ok: false };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("send_message", {
    conv: convId,
    p_content: `${title.trim()} — ${artist.trim()}`,
    p_type: "track_share",
    p_payload: {
      platform,
      track_id: trackId,
      title: title.trim(),
      artist: artist.trim(),
      ...(cover ? { cover_url: cover } : {}),
    },
  });
  if (error || !data) return { ok: false };
  const row = (Array.isArray(data) ? data[0] : data) as Message | undefined;
  if (!row) return { ok: false };
  return { ok: true, message: row };
}

/** Envoie une invitation Jam (jam_invite). Le payload suit les clés exigées par 005. */
export async function sendJamInvite(
  convId: string,
  { jamId, code, hostName }: { jamId: string; code: string; hostName: string }
): Promise<{ ok: boolean; message?: Message }> {
  if (!jamId || !code.trim() || !hostName.trim()) return { ok: false };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("send_message", {
    conv: convId,
    p_content: `${hostName.trim()} — Jam ${code.trim()}`,
    p_type: "jam_invite",
    p_payload: { jam_id: jamId, code: code.trim(), host_name: hostName.trim() },
  });
  if (error || !data) return { ok: false };
  const row = (Array.isArray(data) ? data[0] : data) as Message | undefined;
  if (!row) return { ok: false };
  return { ok: true, message: row };
}

/** Ouvre la conversation avec un ami puis y partage un titre. Retourne l'id de conversation. */
export async function shareTrackWithFriend(
  track: Track,
  friendId: string
): Promise<string | null> {
  const conv = await startConversation(friendId);
  if (!conv) return null;
  const res = await shareTrack(conv.id, {
    platform: track.platform,
    trackId: track.platformTrackId,
    title: track.title,
    artist: track.artist,
    cover: track.coverUrl ?? null,
  });
  return res.ok ? conv.id : null;
}

/** Marque une conversation comme lue. */
export async function markRead(convId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_read", { conv: convId });
  return !error;
}

// Inbox v1 : pas de souscription globale non filtrée (coûteuse et bruyante) —
// on ne souscrit qu'aux conversations ouvertes (dm:{id}) ; l'inbox refetch
// au montage, au focus et après chaque signal (ouverture via ?to, retour de chat).

/** Souscription temps réel d'une conversation (INSERT + UPDATE optionnel). StrictMode-safe. */
export function subscribeConversation(
  convId: string,
  onInsert: (message: Message) => void,
  onUpdate?: (message: Message) => void
): () => void {
  const supabase = createClient();
  const topic = `dm:${convId}`;

  // Même idiome que lib/jam.ts : StrictMode remonte le même topic,
  // ré-attacher des callbacks sur un canal existant jette une erreur.
  const existing = supabase.getChannels().find((c) => c.topic === topic);
  if (existing) {
    void supabase.removeChannel(existing);
  }

  const channel = supabase.channel(topic);
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${convId}`,
    },
    (payload) => onInsert(payload.new as Message)
  );
  if (onUpdate) {
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${convId}`,
      },
      (payload) => onUpdate(payload.new as Message)
    );
  }
  void channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// Typing Phase 5 : canal broadcast séparé `dm:{id}:typing` (broadcast seul,
// aucune postgres_changes) pour ne pas mêler les concerns au canal `dm:{id}`
// qui porte les INSERT/UPDATE de messages.

export interface TypingHandle {
  send: () => void;
  unsubscribe: () => void;
}

/** Souscription "en train d'écrire" d'une conversation (broadcast éphémère). StrictMode-safe. */
export function subscribeTyping(
  convId: string,
  selfId: string,
  onPeerTyping: (userId: string) => void
): TypingHandle {
  const supabase = createClient();
  const topic = `dm:${convId}:typing`;

  const existing = supabase.getChannels().find((c) => c.topic === topic);
  if (existing) {
    void supabase.removeChannel(existing);
  }

  const channel = supabase.channel(topic, {
    config: { broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "typing" }, (message) => {
    const payload = (message as { payload?: { from?: string } }).payload;
    if (payload?.from && payload.from !== selfId) onPeerTyping(payload.from);
  });
  void channel.subscribe();

  return {
    send: () => {
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { from: selfId },
      });
    },
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
