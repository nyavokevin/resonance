"use client";

import { createClient } from "@/lib/supabase/client";
import type { Friendship, ProfileSearchResult } from "@/lib/social";

export interface FriendProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Email persisté (migration 009) — auth.users n'est pas lisible côté
   * client, donc le fallback "préfixe email" passe par cette colonne. */
  email: string | null;
}

export interface FriendshipWithProfile {
  friendship: Friendship;
  /** Profil joint — null si la ligne profiles manque (voir displayNameOf). */
  profile: FriendProfile | null;
  /** Id de l'autre utilisateur (le profil joint). */
  otherId: string;
}

/**
 * Chaîne d'affichage d'un utilisateur : display_name (trim) → préfixe email
 * (avant @) → id tronqué (8 chars). Ne rend JAMAIS un UUID complet.
 * Les profils sans ligne (profile null) ou sans display_name/email tombent
 * sur le dernier recours. `from` = étiquette du site d'appel : en dev, le
 * repli id log un warn avec composant + user id pour localiser le cas.
 */
export function emailPrefix(email: string | null | undefined): string | null {
  const prefix = email?.split("@")[0]?.trim();
  return prefix || null;
}

export function displayNameOf(
  profile:
    | { display_name?: string | null; email?: string | null } | null
    | undefined,
  fallbackId: string,
  from?: string
): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  const prefix = emailPrefix(profile?.email);
  if (prefix) return prefix;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[displayNameOf${from ? `:${from}` : ""}] no display_name/email for user ${fallbackId} — showing id prefix`
    );
  }
  return fallbackId.slice(0, 8);
}

/**
 * Remplit `profiles.email` de l'utilisateur connecté depuis son email auth
 * (seule source client lisible). Idempotent : n'écrit que si la colonne est
 * NULL (lignes pré-009). Silencieux en cas d'échec — l'affichage retombe
 * sur l'id tronqué. À appeler au login/signup (AuthForm) et au bootstrap
 * présence (sessions déjà ouvertes).
 */
export async function syncOwnProfileEmail(): Promise<void> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user?.id || !user.email) return;
    await supabase
      .from("profiles")
      .update({ email: user.email })
      .eq("id", user.id)
      .is("email", null);
  } catch {
    /* silent — fallback id tronqué */
  }
}

async function getSelf() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
};

function toProfileMap(rows: ProfileRow[] | null): Map<string, FriendProfile> {
  const map = new Map<string, FriendProfile>();
  for (const r of rows ?? []) {
    map.set(r.id, { id: r.id, display_name: r.display_name, avatar_url: r.avatar_url, email: r.email ?? null });
  }
  return map;
}

/**
 * La colonne profiles.email existe-t-elle (migration 009) ? Détecté une
 * fois puis mis en cache (recharger la page après avoir appliqué 009).
 */
let emailColumnSupported: boolean | null = null;

function isMissingColumnError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (code === "42703") return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" && /column/i.test(message) && /email/i.test(message)
  );
}

/**
 * Lignes profiles avec repli sans `email` si la colonne manque (009 non
 * appliquée). Sans ce repli, le select avec `email` échoue en entier et
 * display_name/avatar_url sont perdus avec — d'où des ids partout.
 * Retourne null si les deux tentatives échouent (RLS/réseau).
 */
async function selectProfileRows(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<ProfileRow[] | null> {
  if (ids.length === 0) return [];
  if (emailColumnSupported !== false) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .in("id", ids);
    if (!error) {
      emailColumnSupported = true;
      return (data ?? []) as ProfileRow[];
    }
    // Colonne absente : on mémorise et on retombe sans email. Toute autre
    // erreur : un seul retry sans email, sans mémoriser.
    if (isMissingColumnError(error)) emailColumnSupported = false;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  if (error) return null;
  return (data ?? []) as ProfileRow[];
}

/**
 * Profils par ids, tolérant à l'absence de la colonne email (009).
 * Partagé par les listes d'amis, les DM et les demandes de Jam.
 */
export async function fetchProfilesByIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<Map<string, FriendProfile>> {
  const rows = await selectProfileRows(supabase, ids);
  return toProfileMap(rows);
}

async function fetchProfiles(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<Map<string, FriendProfile>> {
  return fetchProfilesByIds(supabase, ids);
}

/** Recherche d'utilisateurs via le RPC search_profiles. */
export async function searchUsers(q: string): Promise<ProfileSearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("search_profiles", { q: query });
  if (error) return [];
  return (data ?? []) as ProfileSearchResult[];
}

/**
 * Nom d'affichage déjà pris (case-insensitive) ? Retourne null quand le
 * RPC 013 est indisponible (migration non appliquée) — l'appelant se tait
 * et laisse la 23505 du serveur gérer le cas au submit.
 */
export async function isDisplayNameTaken(name: string): Promise<boolean | null> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("is_display_name_taken", {
      p_name: trimmed,
    });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

/**
 * L'erreur vient-elle de la contrainte d'unicité du nom (23505 sur
 * profiles_display_name_key) ? Tolérant au message/postgres de GoTrue.
 */
export function isDisplayNameTakenError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /23505|profiles_display_name_key|display_name/i.test(message)
  );
}

/** Amis acceptés (les deux directions), avec le profil de l'autre côté. */
export async function listFriends(): Promise<FriendshipWithProfile[]> {
  const { supabase, userId } = await getSelf();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as Friendship[];
  const otherIds = rows.map((r) =>
    r.requester_id === userId ? r.addressee_id : r.requester_id
  );
  const profiles = await fetchProfiles(supabase, otherIds);
  return rows.map((friendship) => {
    const otherId =
      friendship.requester_id === userId
        ? friendship.addressee_id
        : friendship.requester_id;
    return { friendship, profile: profiles.get(otherId) ?? null, otherId };
  });
}

/** Demandes reçues (pending, addressee = soi), avec le profil du demandeur. */
export async function listReceived(): Promise<FriendshipWithProfile[]> {
  const { supabase, userId } = await getSelf();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "pending")
    .eq("addressee_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as Friendship[];
  const profiles = await fetchProfiles(
    supabase,
    rows.map((r) => r.requester_id)
  );
  return rows.map((friendship) => ({
    friendship,
    profile: profiles.get(friendship.requester_id) ?? null,
    otherId: friendship.requester_id,
  }));
}

/** Demandes envoyées (pending, requester = soi), avec le profil du destinataire. */
export async function listSent(): Promise<FriendshipWithProfile[]> {
  const { supabase, userId } = await getSelf();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "pending")
    .eq("requester_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as Friendship[];
  const profiles = await fetchProfiles(
    supabase,
    rows.map((r) => r.addressee_id)
  );
  return rows.map((friendship) => ({
    friendship,
    profile: profiles.get(friendship.addressee_id) ?? null,
    otherId: friendship.addressee_id,
  }));
}

/** Envoie une demande d'ami. 23505 (paire déjà existante) → duplicate. */
export async function sendRequest(
  userId: string
): Promise<{ ok: boolean; duplicate?: boolean }> {
  const { supabase, userId: self } = await getSelf();
  if (!self || self === userId) return { ok: false };
  const { error } = await supabase.from("friendships").insert({
    requester_id: self,
    addressee_id: userId,
    status: "pending",
  });
  if (!error) return { ok: true };
  if ((error as { code?: string }).code === "23505") {
    return { ok: false, duplicate: true };
  }
  return { ok: false };
}

/** Accepte une demande reçue (addressee = soi). */
export async function acceptRequest(id: string): Promise<boolean> {
  const { supabase, userId } = await getSelf();
  if (!userId) return false;
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", id)
    .eq("addressee_id", userId);
  return !error;
}

/** Refuse une demande (supprime le pending où l'on est impliqué). */
export async function refuseRequest(id: string): Promise<boolean> {
  const { supabase, userId } = await getSelf();
  if (!userId) return false;
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", id)
    .eq("status", "pending")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return !error;
}

/** Annule une demande envoyée (requester = soi). */
export async function cancelRequest(id: string): Promise<boolean> {
  const { supabase, userId } = await getSelf();
  if (!userId) return false;
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", id)
    .eq("status", "pending")
    .eq("requester_id", userId);
  return !error;
}

/** Retire un ami (supprime la relation acceptée où l'on est impliqué). */
export async function removeFriend(id: string): Promise<boolean> {
  const { supabase, userId } = await getSelf();
  if (!userId) return false;
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", id)
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return !error;
}

/** Bloque un utilisateur (l'autre côté ne voit plus la relation). */
export async function blockUser(id: string): Promise<boolean> {
  const { supabase, userId } = await getSelf();
  if (!userId) return false;
  const { error } = await supabase
    .from("friendships")
    .update({ status: "blocked", blocked_by: userId })
    .eq("id", id)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return !error;
}

/** Lève son propre blocage (supprime la relation bloquée par soi). */
export async function unblockUser(id: string): Promise<boolean> {
  const { supabase, userId } = await getSelf();
  if (!userId) return false;
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", id)
    .eq("blocked_by", userId);
  return !error;
}
