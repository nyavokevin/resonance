"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lane B — native OS notification click-to-open (Electron only).
 *
 * The in-app lane (lib/notifications-store) fires
 * `window.resonance?.notify({ title, body, route })` when document.hidden;
 * main shows a native Notification. On click, main refocuses the app and
 * forwards the route here, where we navigate via next/navigation.
 * No-op on web (no window.resonance).
 */
export function useElectronNotifyListener(): void {
  const router = useRouter();

  useEffect(() => {
    if (!window.resonance?.isElectron) return;
    const off = window.resonance.onNotificationClick?.((route: string) => {
      if (typeof route === "string" && route.startsWith("/")) {
        router.push(route);
      }
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [router]);
}

/**
 * Main-window-only mount (Shell is not rendered on /mini — same guard as
 * MiniSync / DiscordPresence: the mini window is a remote control).
 * Renders nothing.
 */
export function ElectronNotifyListener() {
  useElectronNotifyListener();
  return null;
}
