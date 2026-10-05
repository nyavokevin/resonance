"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headphones, Heart, Music2, Play, RotateCcw, Send } from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import { useLocale, useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/client";
import { usePlayer } from "@/lib/player/engine";
import { isLiked, toggleLike } from "@/lib/library";
import { joinInvitedSession } from "@/lib/jam";
import { useJam } from "@/lib/jam-store";
import {
  getConversation,
  getMessages,
  hasJamTarget,
  hasShareTarget,
  markRead,
  richPayload,
  sendText,
  subscribeConversation,
  subscribeTyping,
  type TypingHandle,
} from "@/lib/dm";
import { useOnlineUsers, usePresenceBootstrap } from "@/lib/presence";
import { useNotifications } from "@/lib/notifications-store";
import { PLATFORM_LABELS, type Platform, type Track } from "@/lib/types";
import type { Message } from "@/lib/social";
import { displayNameOf, type FriendProfile } from "@/lib/friends";

interface PendingMessage {
  tempId: string;
  content: string;
  failed: boolean;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[12px] font-semibold text-white uppercase">
      {(name || "?").charAt(0)}
    </span>
  );
}

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** Carte titre partagé : cover, titre/artiste, badge plateforme, lecture + like. */
function TrackShareCard({ message }: { message: Message }) {
  const push = useToasts((s) => s.push);
  const t = useT();
  const router = useRouter();
  const playTrack = usePlayer((s) => s.playTrack);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);

  const p = richPayload(message) as {
    platform?: string;
    track_id?: string;
    title?: string;
    artist?: string;
    cover_url?: string | null;
  };
  const platform = p.platform ?? "";
  const title = p.title || message.content;
  const artist = p.artist ?? "";
  const shared: Track = useMemo(
    () => ({
      id: `${platform}:track:${p.track_id ?? ""}`,
      platform: (platform || "direct") as Platform,
      platformTrackId: p.track_id ?? "",
      title,
      artist,
      coverUrl: p.cover_url ?? undefined,
      sourceUrl: "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [message]
  );

  useEffect(() => {
    void isLiked(shared).then(setLiked);
  }, [shared]);

  async function handlePlay() {
    if (playing) return;
    setPlaying(true);
    try {
      // Même chemin que GenreTrackList : resolve puis playTrack(titre, [titre]).
      const res = await fetch("/api/resolve-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: p.platform,
          trackId: p.track_id,
          title,
          artist,
          coverUrl: p.cover_url ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.track) {
        push(t.common.playError, "error");
        return;
      }
      await playTrack(data.track as Track, [data.track as Track]);
      router.refresh();
    } catch {
      push(t.common.playError, "error");
    } finally {
      setPlaying(false);
    }
  }

  async function handleLike() {
    const next = await toggleLike(shared);
    if (next === null) {
      push(t.common.likeTrackImpossible, "error");
      return;
    }
    setLiked(next);
    push(next ? t.common.likeAddedShort : t.common.likeRemoved, "success");
  }

  return (
    <div className="w-full rounded-xl border border-edge bg-card p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-card bg-base flex items-center justify-center">
          {p.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 size={16} className="text-ink-muted" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{title}</span>
          <span className="block truncate text-[12px] text-ink-soft">{artist}</span>
          <span className="mt-1 inline-block rounded bg-base px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-soft">
            {PLATFORM_LABELS[platform as Platform] ?? platform}
          </span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={() => void handlePlay()}
          disabled={playing}
          aria-label={t.chat.play}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-card bg-accent hover:bg-accent-hover px-3 py-1.5 text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          <Play size={13} fill="currentColor" />
          <span>{t.chat.play}</span>
        </button>
        <button
          onClick={() => void handleLike()}
          aria-label={t.chat.like}
          className={`rounded-card border border-edge p-2 transition-colors ${
            liked ? "text-accent" : "text-ink-soft hover:text-white"
          }`}
        >
          <Heart size={14} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}

/** Carte invitation Jam : host, code, bouton Rejoindre. */
function JamInviteCard({ message }: { message: Message }) {
  const push = useToasts((s) => s.push);
  const t = useT();
  const router = useRouter();
  const [joining, setJoining] = useState(false);

  const p = richPayload(message) as { jam_id?: string; code?: string; host_name?: string };
  const host = p.host_name || "?";

  async function handleJoin() {
    if (joining || !p.jam_id) return;
    setJoining(true);
    try {
      const { data } = await createClient().auth.getUser();
      const uid = data.user?.id;
      if (!uid) {
        push(t.jam.sessionNotFound, "error");
        return;
      }
      const ok = await joinInvitedSession(p.jam_id, uid);
      if (!ok) {
        push(t.jam.sessionNotFound, "error");
        return;
      }
      const code = (() => {
        const raw = richPayload(message);
        return typeof raw.code === "string" && raw.code ? raw.code : "…";
      })();
      useJam.getState().setParticipants([
        { id: uid, name: host },
      ]);
      push(fmt(t.jam.sessionJoined, { code }), "success");
      router.push("/jam");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="w-full rounded-xl border border-edge bg-card p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-accent">
          <Headphones size={20} className="text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">
            {fmt(t.chat.jamInviteTitle, { host })}
          </span>
          <span className="block font-mono text-[13px] font-bold tracking-widest text-accent">
            {p.code ?? ""}
          </span>
        </span>
      </div>
      <button
        onClick={() => void handleJoin()}
        disabled={joining}
        className="mt-2 w-full rounded-card bg-accent hover:bg-accent-hover px-3 py-1.5 text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
      >
        {t.chat.rejoinJam}
      </button>
    </div>
  );
}

export function ChatView({ conversationId }: { conversationId: string }) {
  const push = useToasts((s) => s.push);
  const t = useT();
  const locale = useLocale();

  const [selfId, setSelfId] = useState<string | null>(null);
  const [otherId, setOtherId] = useState("");
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const selfIdRef = useRef<string | null>(null);
  const tempCounter = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingHandleRef = useRef<TypingHandle | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePresenceBootstrap();
  // Activité d'écoute du pair (même canal `online` que FriendsView) :
  // otherId vient de la conversation (user_a/user_b ≠ soi, voir getPeerId).
  const onlineMap = useOnlineUsers(otherId ? [otherId] : []);
  const peerListening = otherId ? onlineMap.get(otherId)?.track ?? null : null;

  const handleInsert = useCallback(
    (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== selfIdRef.current) void markRead(conversationId);
    },
    [conversationId]
  );

  const handleUpdate = useCallback((msg: Message) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const self = data.user?.id ?? null;
        selfIdRef.current = self;
        setSelfId(self);
        if (!self) {
          setLoadError(true);
          setLoading(false);
          return;
        }
        void getConversation(conversationId).then((conv) => {
          if (cancelled) return;
          if (!conv) {
            setLoadError(true);
            setLoading(false);
            push(t.chat.loadFailed, "error");
            return;
          }
          setOtherId(conv.otherId);
          setProfile(conv.profile);
          void getMessages(conversationId).then((rows) => {
            if (cancelled) return;
            setMessages([...rows].reverse());
            setLoading(false);
            void markRead(conversationId);
          });
        });
      });
    const unsubscribe = subscribeConversation(conversationId, handleInsert, handleUpdate);
    const onFocus = () => {
      void markRead(conversationId);
      void getMessages(conversationId).then((rows) => setMessages([...rows].reverse()));
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [conversationId, handleInsert, handleUpdate, push, t]);

  useEffect(() => {
    if (!selfId) return;
    // Canal à part (`dm:{id}:typing`, broadcast seul) : le canal `dm:{id}`
    // reste dédié aux postgres_changes de messages. Envoi non conditionné
    // à appear_online : taper n'est visible que si le pair a le chat ouvert.
    const handle = subscribeTyping(conversationId, selfId, () => {
      setPeerTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setPeerTyping(false), 2500);
    });
    typingHandleRef.current = handle;
    return () => {
      typingHandleRef.current = null;
      if (typingClearRef.current) {
        clearTimeout(typingClearRef.current);
        typingClearRef.current = null;
      }
      handle.unsubscribe();
    };
  }, [conversationId, selfId]);

  function maybeSendTyping(value: string) {
    if (!value) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingHandleRef.current?.send();
  }

  useEffect(() => {
    // Chat ouvert : tue le toast-while-reading (la ligne serveur existe
    // quand même, le store la marque lue à l'arrivée).
    const open = setTimeout(
      () => useNotifications.getState().setOpenConversation(conversationId),
      0
    );
    return () => {
      clearTimeout(open);
      useNotifications.getState().setOpenConversation(null);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function autoresize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function sendContent(raw: string, tempId?: string) {
    const content = raw.trim();
    if (!content) return;
    if (content.length > 2000) {
      push(t.messages.errors.invalid, "error");
      return;
    }
    const id = tempId ?? `tmp-${tempCounter.current++}`;
    if (tempId) {
      setPending((prev) => prev.map((p) => (p.tempId === id ? { ...p, failed: false } : p)));
    } else {
      setPending((prev) => [...prev, { tempId: id, content, failed: false }]);
      setInput("");
      autoresize();
    }
    const res = await sendText(conversationId, content);
    if (res.ok && res.message) {
      const confirmed = res.message;
      setPending((prev) => prev.filter((p) => p.tempId !== id));
      setMessages((prev) =>
        prev.some((m) => m.id === confirmed.id) ? prev : [...prev, confirmed]
      );
    } else {
      setPending((prev) => prev.map((p) => (p.tempId === id ? { ...p, failed: true } : p)));
      push(res.invalid ? t.messages.errors.invalid : t.chat.sendFailed, "error");
    }
  }

  function handleSend() {
    void sendContent(input);
  }

  const name = displayNameOf(profile, otherId, "ChatView:header") || "…";
  const lastMessage = messages[messages.length - 1];
  const showSeen =
    pending.length === 0 &&
    lastMessage !== undefined &&
    lastMessage.sender_id === selfId &&
    lastMessage.read_at !== null;

  return (
    <div className="flex max-w-xl flex-col" style={{ height: "calc(100dvh - 220px)", minHeight: "320px" }}>
      <header className="flex items-center gap-2.5 border-b border-edge pb-3">
        <Link
          href="/messages"
          aria-label={t.chat.back}
          className="rounded p-1.5 text-ink-soft hover:text-white transition-colors"
        >
          <ArrowLeft size={17} />
        </Link>
        <Avatar name={displayNameOf(profile, otherId, "ChatView:header") || "?"} url={profile?.avatar_url ?? null} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-white" title={fmt(t.messages.to, { name })}>
            {name}
          </span>
          {peerListening && (
            <span className="block truncate text-[11px] text-accent">
              {fmt(t.friends.listening, {
                title: peerListening.title,
                artist: peerListening.artist,
              })}
            </span>
          )}
        </span>
      </header>
      {peerTyping && (
        <p className="pt-1 text-[11px] text-accent animate-pulse">{t.chat.typing}</p>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto py-3">
        {loading ? (
          <p className="text-[12px] text-ink-muted">{t.common.loading}</p>
        ) : loadError ? (
          <p className="text-[12px] text-bad">{t.chat.loadFailed}</p>
        ) : messages.length === 0 && pending.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-ink-muted">{t.chat.empty}</p>
        ) : (
          <>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const grouped =
                !!prev &&
                prev.sender_id === m.sender_id &&
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
              const mine = m.sender_id === selfId;
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (grouped ? <span className="w-8 shrink-0" /> : <Avatar name={name} url={profile?.avatar_url ?? null} />)}
                  <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                    {m.type === "track_share" && hasShareTarget(m) ? (
                      <TrackShareCard message={m} />
                    ) : m.type === "jam_invite" && hasJamTarget(m) ? (
                      <JamInviteCard message={m} />
                    ) : (
                      <div
                        className={`rounded-xl px-3 py-1.5 text-[13px] break-words whitespace-pre-wrap ${
                          mine ? "bg-[#5865F2] text-white" : "bg-[#313338] text-white"
                        }`}
                      >
                        {m.content}
                      </div>
                    )}
                    <span className="mt-0.5 text-[10px] text-ink-muted">
                      {formatTime(m.created_at, locale)}
                    </span>
                  </div>
                </div>
              );
            })}
            {pending.map((p) => (
              <div key={p.tempId} className="flex justify-end gap-2">
                <div className="flex max-w-[75%] flex-col items-end">
                  <div
                    className={`rounded-xl px-3 py-1.5 text-[13px] break-words whitespace-pre-wrap bg-[#5865F2] text-white ${
                      p.failed ? "" : "opacity-60"
                    }`}
                  >
                    {p.content}
                  </div>
                  {p.failed ? (
                    <button
                      onClick={() => void sendContent(p.content, p.tempId)}
                      className="mt-0.5 flex items-center gap-1 text-[10px] text-bad hover:text-white transition-colors"
                    >
                      <RotateCcw size={10} />
                      <span>{t.messages.retry}</span>
                    </button>
                  ) : (
                    <span className="mt-0.5 text-[10px] text-ink-muted">{t.messages.sending}</span>
                  )}
                </div>
              </div>
            ))}
            {showSeen && (
              <p className="text-right text-[10px] text-ink-muted">{t.messages.seen}</p>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-edge pt-3">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoresize();
            maybeSendTyping(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={t.messages.typePlaceholder}
          maxLength={2000}
          className="max-h-[160px] min-w-0 flex-1 resize-none rounded-card border border-edge bg-base px-3 py-2 text-[13px] text-white placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label={t.messages.send}
          className="shrink-0 rounded-card bg-accent hover:bg-accent-hover p-2.5 text-white transition-colors disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
