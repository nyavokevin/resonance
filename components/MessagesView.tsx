"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToasts } from "@/lib/toast-store";
import { useLocale, useT } from "@/lib/i18n/locale-store";
import {
  listConversations,
  messagePreview,
  startConversation,
  type ConversationPreview,
} from "@/lib/dm";
import { displayNameOf } from "@/lib/friends";

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[15px] font-semibold text-white uppercase">
      {(name || "?").charAt(0)}
    </span>
  );
}

function formatStamp(iso: string, today: string, yesterday: string, locale: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `${today} ${time}`;
  const day = new Date(now);
  day.setDate(now.getDate() - 1);
  if (date.toDateString() === day.toDateString()) return yesterday;
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function MessagesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const to = searchParams.get("to");
  const push = useToasts((s) => s.push);
  const t = useT();
  const locale = useLocale();

  const [convs, setConvs] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(() => to !== null);
  const startedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConvs(await listConversations());
    } catch {
      push(t.messages.errors.loadFailed, "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    // v1 : pas de souscription inbox globale (non filtrée) — refetch
    // au montage, au focus et après ouverture via ?to (replace ci-dessous).
    const initial = setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!to || startedRef.current === to) return;
    startedRef.current = to;
    void startConversation(to).then((conv) => {
      if (conv) {
        router.replace(`/messages/${conv.id}`);
      } else {
        startedRef.current = null;
        setStarting(false);
        push(t.messages.errors.startFailed, "error");
      }
    });
  }, [to, router, push, t]);

  if (starting) {
    return <p className="text-[12px] text-ink-muted">{t.common.loading}</p>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-[20px] font-bold text-white">{t.messages.title}</h1>
      {loading ? (
        <p className="text-[12px] text-ink-muted">{t.common.loading}</p>
      ) : convs.length === 0 ? (
        <p className="text-[12px] text-ink-muted">{t.messages.empty}</p>
      ) : (
        <ul className="rounded-card bg-card border border-edge divide-y divide-edge">
          {convs.map(({ conversation, otherId, profile, lastMessage, unread }) => {
            const name = displayNameOf(profile, otherId, "MessagesView:inbox");
            const stamp = lastMessage?.created_at ?? conversation.last_message_at;
            return (
              <li key={conversation.id}>
                <Link
                  href={`/messages/${conversation.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover"
                >
                  <Avatar name={displayNameOf(profile, otherId, "MessagesView:inbox")} url={profile?.avatar_url ?? null} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-white">{name}</span>
                      {stamp && (
                        <span className="shrink-0 text-[11px] text-ink-muted">
                          {formatStamp(stamp, t.messages.today, t.messages.yesterday, locale)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
                        {lastMessage ? messagePreview(lastMessage) : t.messages.newChat}
                      </span>
                      {unread > 0 && (
                        <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
