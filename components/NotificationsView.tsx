"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n/locale-store";
import { createClient } from "@/lib/supabase/client";
import {
  notificationContent,
  notificationTarget,
  useNotifications,
  type NotificationRow,
} from "@/lib/notifications-store";

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[14px] font-semibold text-white uppercase">
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

type Group = "today" | "week" | "older";

function groupOf(iso: string): Group {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "today";
  if (now.getTime() - date.getTime() < 7 * 24 * 3600 * 1000) return "week";
  return "older";
}

export function NotificationsView() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const notifications = useNotifications((s) => s.notifications);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const fromIds = notifications
    .map((n) => n.payload.from_user_id)
    .filter((id): id is string => Boolean(id));
  const idsKey = [...new Set(fromIds)].sort().join(",");

  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    void createClient()
      .from("profiles")
      .select("id, avatar_url")
      .in("id", idsKey.split(","))
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string | null> = {};
        for (const r of data as { id: string; avatar_url: string | null }[]) {
          map[r.id] = r.avatar_url;
        }
        setAvatars(map);
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const unread = notifications.filter((n) => !n.read_at).length;
  const groups: { id: Group; label: string; rows: NotificationRow[] }[] = [
    { id: "today", label: t.notifications.today, rows: [] },
    { id: "week", label: t.notifications.thisWeek, rows: [] },
    { id: "older", label: t.notifications.older, rows: [] },
  ];
  for (const n of notifications) groups.find((g) => g.id === groupOf(n.created_at))!.rows.push(n);

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[20px] font-bold text-white">
          {t.notifications.title}
        </h1>
        {unread > 0 && (
          <button
            onClick={() => void markAllRead()}
            className="text-[12px] text-ink-muted hover:text-white transition-colors"
          >
            {t.notifications.markAllRead}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-[12px] text-ink-muted">{t.notifications.empty}</p>
      ) : (
        groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <section key={g.id}>
              <h2 className="px-1 pb-1.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                {g.label}
              </h2>
              <ul className="rounded-card bg-card border border-edge divide-y divide-edge">
                {g.rows.map((n) => {
                  const { body } = notificationContent(n);
                  const name = n.payload?.from_name || "?";
                  const avatarUrl = n.payload?.from_user_id
                    ? (avatars[n.payload.from_user_id] ?? null)
                    : null;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          void markRead(n.id);
                          router.push(notificationTarget(n));
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
                      >
                        <Avatar name={name} url={avatarUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-white">{body}</span>
                          <span className="block text-[11px] text-ink-muted">
                            {formatStamp(n.created_at, t.messages.today, t.messages.yesterday, locale)}
                          </span>
                        </span>
                        {!n.read_at && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
