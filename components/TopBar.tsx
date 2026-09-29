"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { History, SlidersHorizontal, Download, LogOut, ChevronDown, Radio, ListMusic } from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { createClient } from "@/lib/supabase/client";
import { useToasts } from "@/lib/toast-store";
import { useJam } from "@/lib/jam-store";

interface TopBarProps {
  user: { email: string; displayName: string };
  onMenu?: () => void;
}

export function TopBar({ user, onMenu }: TopBarProps) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const jamSession = useJam((s) => s.session);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function comingSoon(label: string) {
    push(`${label} — bientôt disponible`, "info");
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
            aria-label="Ouvrir le menu"
            title="Menu"
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
            title="Jam — écoute ensemble"
            className={`w-8 h-8 flex items-center justify-center rounded-card transition-colors ${
              jamSession
                ? "text-accent bg-accent/15"
                : "text-ink-soft hover:text-white hover:bg-hover"
            }`}
          >
            <Radio size={17} />
          </Link>
          <button
            onClick={() => comingSoon("Historique complet")}
            title="Historique"
            className="w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <History size={17} />
          </button>
          <button
            onClick={() => comingSoon("Égaliseur")}
            title="Égaliseur"
            className="w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <SlidersHorizontal size={17} />
          </button>
          <button
            onClick={() => comingSoon("Import")}
            title="Importer"
            className="w-8 h-8 flex items-center justify-center rounded-card text-ink-soft hover:text-white hover:bg-hover transition-colors"
          >
            <Download size={17} />
          </button>
        </div>

        <div className="h-4 w-px bg-edge" />

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-1 hover:opacity-90"
          >
            <span className="flex w-8 h-8 items-center justify-center rounded-full bg-hover border border-edge text-white text-[13px] font-semibold">
              {initial}
            </span>
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
              <button
                onClick={() => void handleLogout()}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-soft hover:bg-hover hover:text-white transition-colors text-left"
              >
                <LogOut size={15} />
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
