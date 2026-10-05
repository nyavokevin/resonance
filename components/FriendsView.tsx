"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  Check,
  MessageCircle,
  MoreHorizontal,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";
import { useOnlineUsers, usePresenceBootstrap } from "@/lib/presence";
import {
  acceptRequest,
  blockUser,
  cancelRequest,
  listFriends,
  listReceived,
  listSent,
  refuseRequest,
  removeFriend,
  searchUsers,
  sendRequest,
  type FriendshipWithProfile,
} from "@/lib/friends";
import type { ProfileSearchResult } from "@/lib/social";
import { Popover, MenuItem, type PopoverAnchor } from "@/components/Popover";

function anchorFromEvent(e: React.MouseEvent<HTMLElement>): PopoverAnchor {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[13px] font-semibold text-white uppercase">
      {(name || "?").charAt(0)}
    </span>
  );
}

type Tab = "all" | "received" | "sent";

function tabFromParam(value: string | null): Tab {
  return value === "received" || value === "sent" || value === "all" ? value : "all";
}

export function FriendsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const push = useToasts((s) => s.push);
  const t = useT();

  // Onglet piloté par l'URL (?tab=received|sent|all) : pas d'état local,
  // les toasts/actions profondes (/friends?tab=received) restent synchronisés.
  const tab = tabFromParam(searchParams.get("tab"));
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [received, setReceived] = useState<FriendshipWithProfile[]>([]);
  const [sent, setSent] = useState<FriendshipWithProfile[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [menuFriendshipId, setMenuFriendshipId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);

  usePresenceBootstrap();
  const friendIds = useMemo(() => friends.map((f) => f.otherId), [friends]);
  const onlineMap = useOnlineUsers(friendIds);

  const refresh = useCallback(async () => {
    try {
      const [f, r, s] = await Promise.all([listFriends(), listReceived(), listSent()]);
      setFriends(f);
      setReceived(r);
      setSent(s);
    } catch {
      push(t.friends.errors.loadFailed, "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    // v1 : pas de realtime ici — la table friendships n'est volontairement pas
    // dans la publication supabase_realtime ; on refetch au montage et au focus.
    const initial = setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      void searchUsers(q)
        .then((rows) => setResults(rows))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  async function runAction(id: string, fn: (fid: string) => Promise<boolean>, okMsg: string) {
    if (busyId) return;
    setBusyId(id);
    const ok = await fn(id);
    setBusyId(null);
    push(ok ? okMsg : t.friends.errors.actionFailed, ok ? "success" : "error");
    if (ok) void refresh();
  }

  async function handleAdd(userId: string) {
    if (busyId) return;
    setBusyId(userId);
    const res = await sendRequest(userId);
    setBusyId(null);
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(userId));
      push(t.friends.toasts.sent, "success");
      void refresh();
    } else {
      push(res.duplicate ? t.friends.errors.alreadySent : t.friends.errors.sendFailed, "error");
    }
  }

  const displayName = (p: FriendshipWithProfile) =>
    p.profile?.display_name || p.otherId.slice(0, 8);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: t.friends.tabs.all },
    { id: "received", label: t.friends.tabs.received, count: received.length },
    { id: "sent", label: t.friends.tabs.sent, count: sent.length },
  ];

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-[20px] font-bold text-white">{t.friends.title}</h1>

      <div className="rounded-card bg-card border border-edge p-4">
        <div className="flex items-center gap-2 rounded-card border border-edge bg-base px-3 py-2">
          <Search size={15} className="shrink-0 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={t.friends.search.placeholder}
            maxLength={60}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-ink-muted outline-none"
          />
          {searching && <span className="text-[11px] text-ink-muted">…</span>}
        </div>
        {query.trim().length < 2 ? (
          <p className="mt-2 text-[12px] text-ink-muted">{t.friends.search.hint}</p>
        ) : (
          <ul className="mt-2 divide-y divide-edge">
            {results.map((u) => {
              const added = addedIds.has(u.id);
              return (
                <li key={u.id} className="flex items-center gap-2.5 py-2">
                  <Avatar name={u.display_name ?? "?"} url={u.avatar_url} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white">
                    {u.display_name ?? u.id.slice(0, 8)}
                  </span>
                  <button
                    onClick={() => void handleAdd(u.id)}
                    disabled={added || busyId === u.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-card bg-accent hover:bg-accent-hover px-3 py-1.5 text-[12px] font-medium text-white transition-colors disabled:opacity-60"
                  >
                    <UserPlus size={13} />
                    <span>{added ? t.friends.search.added : t.friends.search.add}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => router.replace(`/friends?tab=${tb.id}`)}
            className={`flex items-center gap-1.5 rounded-card px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
              tab === tb.id ? "bg-hover text-white" : "text-ink-soft hover:text-white"
            }`}
          >
            <span>{tb.label}</span>
            {tb.count !== undefined && tb.count > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {tb.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[12px] text-ink-muted">{t.common.loading}</p>
      ) : tab === "received" ? (
        <div className="rounded-card bg-card border border-edge p-2">
          {received.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t.friends.requests.empty}</p>
          ) : (
            received.map(({ friendship, profile, otherId }) => (
              <div key={friendship.id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar name={profile?.display_name ?? "?"} url={profile?.avatar_url ?? null} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-white">
                  {displayName({ friendship, profile, otherId })}
                </span>
                <button
                  onClick={() => void runAction(friendship.id, acceptRequest, t.friends.toasts.accepted)}
                  disabled={busyId === friendship.id}
                  className="flex shrink-0 items-center gap-1 rounded-card bg-accent hover:bg-accent-hover px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors disabled:opacity-60"
                >
                  <Check size={13} />
                  <span>{t.friends.requests.accept}</span>
                </button>
                <button
                  onClick={() => void runAction(friendship.id, refuseRequest, t.friends.toasts.refused)}
                  disabled={busyId === friendship.id}
                  aria-label={t.friends.requests.refuse}
                  className="shrink-0 rounded-card border border-edge p-1.5 text-ink-soft hover:text-white transition-colors disabled:opacity-60"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={() => void runAction(friendship.id, blockUser, t.friends.toasts.blocked)}
                  disabled={busyId === friendship.id}
                  aria-label={t.friends.requests.block}
                  className="shrink-0 rounded-card border border-edge p-1.5 text-ink-soft hover:text-bad transition-colors disabled:opacity-60"
                >
                  <Ban size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : tab === "sent" ? (
        <div className="rounded-card bg-card border border-edge p-2">
          {sent.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t.friends.requests.empty}</p>
          ) : (
            sent.map(({ friendship, profile, otherId }) => (
              <div key={friendship.id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar name={profile?.display_name ?? "?"} url={profile?.avatar_url ?? null} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-white">
                  {displayName({ friendship, profile, otherId })}
                </span>
                <button
                  onClick={() => void runAction(friendship.id, cancelRequest, t.friends.toasts.cancelled)}
                  disabled={busyId === friendship.id}
                  className="shrink-0 rounded-card border border-edge px-2.5 py-1.5 text-[12px] text-ink-soft hover:text-white transition-colors disabled:opacity-60"
                >
                  {t.common.cancel}
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-card bg-card border border-edge p-2">
          {friends.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t.friends.list.empty}</p>
          ) : (
            friends.map((row) => {
              const { friendship, profile, otherId } = row;
              // Confiance à la meta auto-déclarée : chaque client ne track que si
              // son propre appear_online=true et n'inclut son titre que si son
              // propre share_listening_activity=true (le serveur ne peut pas
              // filtrer la présence) — une meta présente = diffusion autorisée.
              const presence = onlineMap.get(otherId);
              const listening = presence?.track;
              return (
                <div key={friendship.id} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="relative shrink-0">
                    <Avatar name={profile?.display_name ?? "?"} url={profile?.avatar_url ?? null} />
                    {presence?.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-ok" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-white">
                      {displayName(row)}
                    </span>
                    {listening && (
                      <span className="block truncate text-[11px] text-accent">
                        {fmt(t.friends.listening, {
                          title: listening.title,
                          artist: listening.artist,
                        })}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => router.push(`/messages?to=${otherId}`)}
                    className="flex shrink-0 items-center gap-1.5 rounded-card bg-accent hover:bg-accent-hover px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors"
                  >
                    <MessageCircle size={13} />
                    <span>{t.friends.list.message}</span>
                  </button>
                  <button
                    onClick={() => void runAction(friendship.id, removeFriend, t.friends.toasts.removed)}
                    disabled={busyId === friendship.id}
                    className="flex shrink-0 items-center gap-1 rounded-card border border-edge px-2.5 py-1.5 text-[12px] text-ink-soft hover:text-white transition-colors disabled:opacity-60"
                  >
                    <UserMinus size={13} />
                    <span>{t.friends.list.remove}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      setMenuFriendshipId(friendship.id);
                      setMenuAnchor(anchorFromEvent(e));
                    }}
                    aria-label={t.friends.requests.block}
                    className="shrink-0 rounded p-1 text-ink-muted hover:text-white transition-colors"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      <Popover
        anchor={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuFriendshipId(null);
        }}
      >
        {menuFriendshipId && (
          <MenuItem
            icon={<Ban size={14} />}
            danger
            onClick={() => {
              setMenuAnchor(null);
              const id = menuFriendshipId;
              setMenuFriendshipId(null);
              void runAction(id, blockUser, t.friends.toasts.blocked);
            }}
          >
            {t.friends.requests.block}
          </MenuItem>
        )}
      </Popover>
    </div>
  );
}
