"use client";

import { useEffect, useState } from "react";
import { MiniPlayerWindow } from "@/components/MiniPlayerWindow";
import { useInitLocale, useT } from "@/lib/i18n/locale-store";

/**
 * Standalone route for the frameless always-on-top mini window.
 * Rendered outside the (app) group: no Shell, no PlayerBar, no player init.
 * It only mirrors state pushed from the main window over IPC.
 */
export default function MiniPage() {
  useInitLocale();
  const t = useT();
  const [snap, setSnap] = useState<MiniSnapshot | null>(null);
  // Gate the Electron branch on mount: the server (and the first client
  // render) always output the fallback, so hydration never mismatches.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mounted || !window.resonance?.isElectron) return;
    const off = window.resonance.onMiniState((state) => setSnap(state));
    window.resonance.sendMiniCommand({ type: "sync" });
    return () => {
      off();
    };
  }, [mounted]);

  if (!mounted || !window.resonance?.isElectron) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-panel p-4 text-center">
        <p className="text-[13px] text-ink-muted">{t.player.miniElectronOnly}</p>
      </div>
    );
  }

  return <MiniPlayerWindow snap={snap} />;
}
