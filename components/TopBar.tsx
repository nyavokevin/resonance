"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { History, SlidersHorizontal, Download, LogOut, ChevronDown, Radio, ListMusic, Settings } from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { createClient } from "@/lib/supabase/client";
import { useToasts } from "@/lib/toast-store";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";
import { useJam } from "@/lib/jam-store";
import {
  notificationContent,
  notificationTarget,
  useNotifications,
} from "@/lib/notifications-store";

interface TopBarProps {
  user: { email: string; displayName: string; avatarUrl?: string };
  onMenu?: () => void;
}

// Stale/404 avatar URL (bucket wiped, file removed, 008 not applied) :
// fall back to the initial instead of a broken <img>. The key= on the
// call site remounts on URL change, resetting the broken flag.
function HeaderAvatar({ url, initial }: { url: string; initial: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex w-8 h-8 items-center justify-center rounded-full bg-hover border border-edge text-white text-[13px] font-semibold">
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="w-8 h-8 shrink-0 rounded-full object-cover border border-edge"
    />
  );
}

export function TopBar({ user, onMenu }: TopBarProps) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const jamSession = useJam((s) => s.session);
  const notifications = useNotifications((s) => s.notifications);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const unread = notifications.filter((n) => !n.read_at).length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!bellRef.current?.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function comingSoon(label: string) {
    push(fmt(t.common.comingSoon, { label }), "info");
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 lg:left-[220px] h-16 bg-panel border-b border-edge z-30 flex items-center justify-between px-4 md:px-6 gap-3 md:gap-4">
      <div className="flex items-center gap-2 flex-1 min-w-0 max-w-xl">
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label={t.topbar.openMenu}
            title={t.topbar.menu}
            className="lg:hidden w-9 h-9 shrink-0 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <ListMusic size={18} />
          </button>
        )}
        <UrlInput />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1">
          <Link
            href="/jam"
            title={t.topbar.jamTitle}
            className={`w-8 h-8 flex items-center justify-center rounded-card transition-colors ${
              jamSession
                ? "text-accent bg-accent/15"
                : "text-ink-soft hover:text-white hover:bg-hover"
            }`}
          >
            <Radio size={17} />
          </Link>
          <button
            onClick={() => comingSoon(t.topbar.historySoon)}
            title={t.topbar.history}
            className="w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <History size={17} />
          </button>
          <button
            onClick={() => comingSoon(t.topbar.equalizer)}
            title={t.topbar.equalizer}
            className="w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <SlidersHorizontal size={17} />
          </button>
          <button
            onClick={() => comingSoon(t.topbar.importAction)}
            title={t.topbar.import}
            className="w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <Download size={17} />
          </button>
          <div ref={bellRef} className="relative">
            <button
              onClick={() => setBellOpen((o) => !o)}
              title={t.notifications.title}
              aria-label={t.notifications.title}
              className="relative w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
            >
              <Bell size={17} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-card border border-edge bg-card shadow-xl animate-rise-in overflow-hidden z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-edge">
                  <span className="text-[13px] font-semibold text-white">
                    {t.notifications.title}
                  </span>
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
                  <p className="px-3 py-3 text-[12px] text-ink-muted">
                    {t.notifications.empty}
                  </p>
                ) : (
                  notifications.slice(0, 8).map((n) => {
                    const { body } = notificationContent(n);
                    const initial = (n.payload?.from_name || "?").charAt(0).toUpperCase();
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          setBellOpen(false);
                          void markRead(n.id);
                          router.push(notificationTarget(n));
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hover transition-colors"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[11px] font-semibold text-white uppercase">
                          {initial}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                          {body}
                        </span>
                        {!n.read_at && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                        )}
                      </button>
                    );
                  })
                )}
                <Link
                  href="/notifications"
                  onClick={() => setBellOpen(false)}
                  className="block px-3 py-2 text-center text-[12px] text-ink-muted hover:text-white border-t border-edge transition-colors"
                >
                  {t.notifications.title} →
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px bg-edge" />

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-1 hover:opacity-90"
          >
            {user.avatarUrl ? (
              <HeaderAvatar key={user.avatarUrl} url={user.avatarUrl} initial={initial} />
            ) : (
              <span className="flex w-8 h-8 items-center justify-center rounded-full bg-hover border border-edge text-white text-[13px] font-semibold">
                {initial}
              </span>
            )}
            <span className="text-[13px] font-medium text-white hidden sm:inline-block">
              {user.displayName}
            </span>
            <ChevronDown size={14} className="text-ink-muted hidden sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 rounded-card border border-edge bg-card shadow-xl animate-rise-in overflow-hidden z-50">
              <p className="px-3 py-2 text-[11px] text-ink-muted truncate border-b border-edge">
                {user.email}
              </p>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-soft hover:bg-hover hover:text-white transition-colors text-left"
              >
                <Settings size={15} />
                {t.topbar.settings}
              </Link>
              <button
                onClick={() => void handleLogout()}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-soft hover:bg-hover hover:text-white transition-colors text-left"
              >
                <LogOut size={15} />
                {t.topbar.logout}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
