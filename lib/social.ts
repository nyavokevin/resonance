// Resonance — types sociaux (amis + DM). Types seuls, aucune logique client.

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  blocked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string | null;
  created_at: string;
}

export type MessageType = "text" | "track_share" | "jam_invite" | "system";

/** Payload futur pour un partage de titre (type `track_share`). */
export interface TrackSharePayload {
  platform?: string;
  track_id?: string;
  title?: string;
  artist?: string;
  cover_url?: string | null;
  source_url?: string | null;
}

/** Payload futur pour une invitation Jam (type `jam_invite`). */
export interface JamInvitePayload {
  session_id?: string;
  code?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/** Préférences de confidentialité (colonnes `profiles`). */
export interface ProfilePrivacy {
  share_listening_activity: boolean;
  allow_friend_requests: boolean;
  appear_online: boolean;
  discord_presence: boolean;
}

/** Ligne retournée par le RPC `search_profiles`. */
export interface ProfileSearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}
