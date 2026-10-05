"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { listConversations } from "@/lib/dm";
import { listReceived } from "@/lib/friends";
import { useToasts } from "@/lib/toast-store";
import { dictionaries, fmt } from "@/lib/i18n/dictionaries";
import { useLocaleStore } from "@/lib/i18n/locale-store";

export type NotificationType =
  | "message"
  | "friend_request"
  | "friend_accepted"
  | "jam_invite";

export interface NotificationPayload {
  from_user_id?: string;
  from_name?: string | null;
  conversation_id?: string;
  preview?: string;
  friendship_id?: string;
  /** Lien direct vers la session (payload enrichi 011+ du trigger). */
  jam_id?: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
}

/** Deep link par type (partagé TopBar + page /notifications).
 *  jam_invite : renvoie le lien vers la session si dispo (les vieilles
 *  notifications 007 n'ont pas de jam_id dans le payload → /jam simple,
 *  l'utilisateur retombe sur restoreJamSession ou l'écran de création). */
export function notificationTarget(n: NotificationRow): string {
  const conv = n.payload?.conversation_id;
  switch (n.type) {
    case "message":
      return conv ? `/messages/${conv}` : "/messages";
    case "friend_request":
      return "/friends?tab=received";
    case "friend_accepted":
      return "/friends";
    case "jam_invite":
      return n.payload?.jam_id ? `/jam/invite/${n.payload.jam_id}` : "/jam";
  }
}

/**
 * Contrat Lane B (Electron, lane parallèle — ne pas toucher à electron/) :
 * quand la page est cachée, on délègue en plus à l'hôte desktop.
 * Silencieux sur web (optionnel chaîné, try/catch, jamais bloquant).
 */
function handoffToOS(title: string, body: string, route: string) {
  try {
    if (typeof document !== "undefined" && document.hidden) {
      (
        window as unknown as {
          resonance?: {
            notify?: (p: { title: string; body: string; route: string }) => void;
          };
        }
      ).resonance?.notify?.({ title, body, route });
    }
  } catch {
    /* web : jamais bloquant */
  }
}

/** Texte + action par type (toasts et lignes partagent le même libellé). */
export function notificationContent(n: NotificationRow): {
  body: string;
  action: { label: string; href: string };
} {
  const t = dictionaries[useLocaleStore.getState().locale].notifications;
  const payload = n.payload ?? {};
  const name = payload.from_name || "?";
  switch (n.type) {
    case "message":
      return {
        body: fmt(t.newMessage, { name, preview: payload.preview ?? "" }),
        action: { label: t.view, href: notificationTarget(n) },
      };
    case "friend_request":
      return {
        body: fmt(t.newRequest, { name }),
        action: { label: t.accept, href: "/friends?tab=received" },
      };
    case "friend_accepted":
      return {
        body: fmt(t.accepted, { name }),
        action: { label: t.view, href: "/friends" },
      };
    case "jam_invite":
      return {
        body: fmt(t.jamInvite, { name }),
        action: { label: t.join, href: "/jam" },
      };
  }
}

function raiseToast(n: NotificationRow) {
  const t = dictionaries[useLocaleStore.getState().locale].notifications;
  const { body, action } = notificationContent(n);
  useToasts.getState().push(body, "info", action);
  handoffToOS(t.title, body, action.href);
}

interface NotificationsState {
  notifications: NotificationRow[];
  unreadDM: number;
  pendingRequests: number;
  openConversationId: string | null;
  setOpenConversation: (id: string | null) => void;
  fetchAll: (userId: string) => Promise<void>;
  subscribe: (userId: string | null) => () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const LIST_LIMIT = 30;

export const useNotifications = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadDM: 0,
  pendingRequests: 0,
  openConversationId: null,
  setOpenConversation: (id) => set({ openConversationId: id }),

  fetchAll: async (userId) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    // Durcit à la frontière : payload NULL → {} pour tous les lecteurs aval.
    if (data) {
      set({
        notifications: (data as NotificationRow[]).map((row) => ({
          ...row,
          payload: row.payload ?? {},
        })),
      });
    }
    const [convs, received] = await Promise.all([
      listConversations(),
      listReceived(),
    ]);
    set({
      unreadDM: convs.reduce((sum, c) => sum + c.unread, 0),
      pendingRequests: received.length,
    });
  },

  subscribe: (userId) => {
    if (!userId) return () => {};
    void get().fetchAll(userId);
    const supabase = createClient();
    const topic = `notifications:${userId}`;

    // Même idiome que lib/dm.ts : StrictMode remonte le même topic,
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
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const incoming = payload.new as NotificationRow;
        const row: NotificationRow = {
          ...incoming,
          payload: incoming.payload ?? {},
        };
        // Dédoublonne (reconnect StrictMode / double event).
        if (get().notifications.some((n) => n.id === row.id)) return;
        set({ notifications: [row, ...get().notifications].slice(0, LIST_LIMIT) });
        const convId = row.payload?.conversation_id;
        if (get().openConversationId && convId && convId === get().openConversationId) {
          // Chat ouvert : pas de toast, marqué lu (la ligne serveur existe déjà).
          void get().markRead(row.id);
        } else {
          raiseToast(row);
        }
        void listConversations()
          .then((convs) =>
            set({ unreadDM: convs.reduce((sum, c) => sum + c.unread, 0) })
          )
          .catch(() => {});
        if (row.type === "friend_request" || row.type === "friend_accepted") {
          void listReceived()
            .then((received) => set({ pendingRequests: received.length }))
            .catch(() => {});
        }
      }
    );
    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  markRead: async (id) => {
    set({
      notifications: get().notifications.map((n) =>
        n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n
      ),
    });
    await createClient()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  },

  markAllRead: async () => {
    const unreadIds = get()
      .notifications.filter((n) => !n.read_at)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    set({
      notifications: get().notifications.map((n) =>
        n.read_at ? n : { ...n, read_at: now }
      ),
    });
    await createClient().from("notifications").update({ read_at: now }).in("id", unreadIds);
  },
}));
