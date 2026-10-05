"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { PlayerBar } from "@/components/PlayerBar";
import { FloatingPlayer } from "@/components/FloatingPlayer";
import { MiniSync } from "@/components/MiniSync";
import { DiscordPresence } from "@/lib/discord-presence";
import { ElectronNotifyListener } from "@/lib/electron-notify";
import { QueuePanel } from "@/components/QueuePanel";
import { Toaster } from "@/components/Toaster";
import { JamController } from "@/components/JamController";
import { KeyboardShortcuts } from "@/components/PlayerControls";
import { usePlayer } from "@/lib/player/engine";
import { useInitLocale } from "@/lib/i18n/locale-store";
import type { PlaylistSummaryServer } from "@/lib/library-server";

interface ShellProps {
  user: { email: string; displayName: string } | null;
  likedCount: number;
  playlists: PlaylistSummaryServer[];
  children: ReactNode;
}

export function Shell({ user, likedCount, playlists, children }: ShellProps) {
  const queueOpen = usePlayer((s) => s.queueOpen);
  const init = usePlayer((s) => s.init);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useInitLocale();

  useEffect(() => {
    init();
    const off = window.resonance?.onMediaKey((action) => {
      console.log("[media-key] received:", action);
      const p = usePlayer.getState();
      if (action === "toggle") void p.toggle();
      else if (action === "next") void p.next();
      else if (action === "previous") void p.previous();
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [init]);

  return (
    <KeyboardShortcuts>
      <div className="min-h-screen bg-base">
        {user && (
          <Sidebar
            likedCount={likedCount}
            playlists={playlists}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        )}
        {user && (
          <TopBar user={user} onMenu={() => setDrawerOpen(true)} />
        )}
        <div className="pt-16 pb-[100px] min-h-screen bg-base lg:pl-[220px]">
          <div className="flex flex-col xl:flex-row p-4 md:p-6 gap-6 w-full max-w-[1720px] mx-auto">
            <main className="flex-1 flex flex-col min-w-0 space-y-6">{children}</main>
            {user && queueOpen && <QueuePanel />}
          </div>
        </div>
        {user && <PlayerBar />}
        {user && <FloatingPlayer />}
        {user && <MiniSync />}
        {user && <DiscordPresence />}
        {user && <ElectronNotifyListener />}
        {user && <JamController />}
        <Toaster />
      </div>
    </KeyboardShortcuts>
  );
}