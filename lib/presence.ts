"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { usePlayer } from "@/lib/player/engine";
import { useJam } from "@/lib/jam-store";
import { syncOwnProfileEmail } from "@/lib/friends";
import type { ProfilePrivacy } from "@/lib/social";

// Canal `online` global : présence + activité d'écoute des amis (Phase 5).
//
// Même forme de canal que les sessions Jam (lib/jam.ts `subscribeJam`,
// volontairement NON refactoré ici : chaque session Jam garde son propre
// canal `jam:{id}` avec presence key=userId + broadcast self:false).
// Ici le topic est global (`online`) et ne transporte que de la présence
// (pas de postgres_changes, pas de broadcast).

const TOPIC = "online";
const HEARTBEAT_MS = 30_000;

export interface ActivityTrack {
  title: string;
  artist: string;
}

export interface PresenceMeta {
  name: string;
  track: ActivityTrack | null;
  /** Code de la Jam rejointe, ou null hors Jam (payload tiny : 6 chars). */
  jamCode: string | null;
}

export type OnlineMap = Map<
  string,
  { online: boolean; track: ActivityTrack | null; jamCode: string | null }
>;

interface PresenceState {
  entries: Record<string, PresenceMeta>;
  setEntries: (entries: Record<string, PresenceMeta>) => void;
}

const usePresenceStore = create<PresenceState>((set) => ({
  entries: {},
  setEntries: (entries) => set({ entries }),
}));

type Channel = NonNullable<ReturnType<ReturnType<typeof createClient>["channel"]>>;

let channel: Channel | null = null;
let activeUserId: string | null = null;
let metaGetter: (() => PresenceMeta | null) | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

function pushState(ch: Channel) {
  const raw = ch.presenceState<PresenceMeta>();
  const entries: Record<string, PresenceMeta> = {};
  for (const [userId, metas] of Object.entries(raw)) {
    if (metas.length > 0) entries[userId] = metas[0];
  }
  usePresenceStore.getState().setEntries(entries);
}

function teardown() {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  if (channel) {
    const ch = channel;
    channel = null;
    activeUserId = null;
    metaGetter = null;
    void createClient().removeChannel(ch);
  }
  usePresenceStore.getState().setEntries({});
}

/** Ligne de vie privée de l'utilisateur connecté (flags + nom d'affichage). */
export async function fetchMyPrivacy(): Promise<
  (ProfilePrivacy & { display_name: string | null }) | null
> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, share_listening_activity, allow_friend_requests, appear_online, discord_presence")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ProfilePrivacy & { display_name: string | null };
  return {
    display_name: row.display_name,
    share_listening_activity: row.share_listening_activity ?? true,
    allow_friend_requests: row.allow_friend_requests ?? true,
    appear_online: row.appear_online ?? true,
    discord_presence: row.discord_presence ?? true,
  };
}

/**
 * Assure le canal `online` global pour userId (StrictMode-safe : même
 * pattern getChannels/removeChannel que lib/jam.ts). getMeta est rappelée
 * à chaque (re)track : elle retourne null quand le profil est invisible
 * (appear_online=false) — dans ce cas on ne track pas du tout.
 * Retourne l'unsubscribe (refcounté : le canal ne tombe que quand le
 * dernier appelant se désabonne).
 */
export function ensureOnlineChannel(
  userId: string,
  getMeta: () => PresenceMeta | null
): () => void {
  metaGetter = getMeta;
  if (channel && activeUserId === userId) {
    refCount += 1;
    const meta = getMeta();
    if (meta) void channel.track(meta);
    else void channel.untrack();
    return () => {
      refCount -= 1;
      if (refCount <= 0) {
        refCount = 0;
        teardown();
      }
    };
  }

  teardown();
  const supabase = createClient();
  // StrictMode remonte le même topic : ré-attacher des callbacks sur un
  // canal existant jette une erreur → on repart d'un canal frais.
  const existing = supabase.getChannels().find((c) => c.topic === TOPIC);
  if (existing) {
    void supabase.removeChannel(existing);
  }

  // Clé de présence = userId (comme lib/jam.ts) : sans elle, les clés
  // de presenceState() sont aléatoires et useOnlineUsers(friendIds) ne
  // retrouve jamais personne — meta.track semblait toujours vide côté lecteur.
  const ch = supabase.channel(TOPIC, {
    config: { presence: { key: userId } },
  }) as Channel;
  channel = ch;
  activeUserId = userId;
  refCount = 1;
  ch.on("presence", { event: "sync" }, () => pushState(ch));
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      const meta = metaGetter?.();
      if (meta) void ch.track(meta);
    }
  });
  heartbeat = setInterval(() => {
    if (!channel || activeUserId !== userId) return;
    const meta = metaGetter?.();
    if (meta) void channel.track(meta);
    else void channel.untrack();
  }, HEARTBEAT_MS);

  return () => {
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      teardown();
    }
  };
}

/** Re-track immédiat avec la meta courante (changement de titre ou de flags). */
export function retrackPresence(): void {
  if (!channel) return;
  const meta = metaGetter?.();
  if (meta) void channel.track(meta);
  else void channel.untrack();
}

/** Disparaît de la présence sans couper le canal (toggle appear_online off). */
export function untrackPresence(): void {
  if (channel) void channel.untrack();
}

/** Coupe le canal `online` global (tous les appelants). */
export function stopOnlineChannel(): void {
  refCount = 0;
  teardown();
}

/** Présence des amis donnés (filtrée aux ids demandés). */
export function useOnlineUsers(friendIds: string[]): OnlineMap {
  const entries = usePresenceStore((s) => s.entries);
  const key = friendIds.join(",");
  return useMemo(() => {
    const map: OnlineMap = new Map();
    for (const id of key.split(",").filter(Boolean)) {
      const meta = entries[id];
      map.set(id, {
        online: Boolean(meta),
        track: meta?.track ?? null,
        jamCode: meta?.jamCode ?? null,
      });
    }
    return map;
  }, [entries, key]);
}

/**
 * Bootstrap global : récupère soi + flags de vie privée, puis assure le
 * canal `online` avec une meta auto-déclarée (nom + titre courant).
 * À monter une fois par surface sociale (FriendsView, ChatView).
 */
export function usePresenceBootstrap(): void {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<ProfilePrivacy | null>(null);
  const [myName, setMyName] = useState("?");
  const track = usePlayer((s) => s.currentTrack());
  // Code de la Jam rejointe (null hors Jam) — lu comme currentTrack.
  const jamCode = useJam((s) => s.session?.code ?? null);

  const privacyRef = useRef(privacy);
  const nameRef = useRef(myName);
  const trackRef = useRef(track);
  const jamCodeRef = useRef(jamCode);

  useEffect(() => {
    privacyRef.current = privacy;
    nameRef.current = myName;
    trackRef.current = track;
    jamCodeRef.current = jamCode;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled || !auth.user?.id) return;
      setSelfId(auth.user.id);
      // Backfill pré-009 : persiste l'email auth dans sa ligne profiles
      // (une seule écriture tant que la colonne est NULL).
      void syncOwnProfileEmail();
      const row = await fetchMyPrivacy();
      if (cancelled || !row) return;
      // Même chaîne que displayNameOf, avec l'email auth direct (lisible
      // pour soi) : display_name → préfixe email → "?".
      setMyName(
        row.display_name?.trim() ||
          auth.user.email?.split("@")[0]?.trim() ||
          "?"
      );
      setPrivacy({
        share_listening_activity: row.share_listening_activity,
        allow_friend_requests: row.allow_friend_requests,
        appear_online: row.appear_online,
        discord_presence: row.discord_presence,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const privacyKey = privacy
    ? `${privacy.appear_online}/${privacy.share_listening_activity}`
    : "";
  const trackKey = track ? `${track.title} — ${track.artist}` : "";
  const jamCodeKey = jamCode ?? "";

  useEffect(() => {
    if (!selfId || !privacy) return;
    const unsubscribe = ensureOnlineChannel(selfId, () => {
      const p = privacyRef.current;
      if (!p?.appear_online) return null;
      const t = trackRef.current;
      return {
        name: nameRef.current,
        track:
          p.share_listening_activity && t
            ? { title: t.title, artist: t.artist }
            : null,
        // Confiance à la meta auto-déclarée (comme le titre) : le canal
        // est filtré côté client aux amis via useOnlineUsers(friendIds) —
        // le code n'est donc visible que par les amis en ligne.
        jamCode: jamCodeRef.current,
      };
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId, privacyKey]);

  useEffect(() => {
    retrackPresence();
  }, [trackKey, privacyKey, jamCodeKey]);
}
