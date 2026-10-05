"use client";

import { createClient } from "@/lib/supabase/client";
import type { Friendship, ProfileSearchResult } from "@/lib/social";

export interface FriendProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FriendshipWithProfile {
  friendship: Friendship;
  profile: FriendProfile | null;
  /** Id de l'autre utilisateur (le profil joint). */
  otherId: string;
}

async function getSelf() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

function toProfileMap(
  rows: { id: string; display_name: string | null; avatar_url: string | null }[] | null
): Map<string, FriendProfile> {
  const map = new Map<string, FriendProfile>();
  for (const r of rows ?? []) {
    map.set(r.id, { id: r.id, display_name: r.display_name, avatar_url: r.avatar_url });
  }
  return map;
}

async function fetchProfiles(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<Map<string, FriendProfile>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  return toProfileMap(
    (data ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]
  );
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
