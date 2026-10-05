"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePlayer } from "@/lib/player/engine";

const THROTTLE_MS = 5_000;
const PROGRESS_DELTA_MS = 1_000;
// Spotify-like: keep the frozen track visible briefly on pause, then clear.
const PAUSE_CLEAR_MS = 30_000;

interface DiscordFlags {
  discord_presence: boolean;
  appear_online: boolean;
}

async function fetchDiscordFlags(): Promise<DiscordFlags | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return null;
  const { data } = await supabase
    .from("profiles")
    .select("discord_presence, appear_online")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as Partial<DiscordFlags>;
  return {
    discord_presence: row.discord_presence ?? true,
    appear_online: row.appear_online ?? true,
  };
}

/**
 * Discord Rich Presence (desktop Electron only).
 *
 * Subscribes to the player store and forwards Listening activity to the
 * main process via window.resonance (which owns the Discord IPC client).
 * No-op on web (no window.resonance).
 *
 * Gating: skipped entirely when discord_presence=false OR appear_online=false
 * (invisible everywhere means invisible on Discord too).
 *
 * Throttle: max 1 update / 5s + only-on-change (track id, play/pause,
 * progress delta > 1s). Pause sends one frozen snapshot then arms a 30s
 * timer that clears (cancelled on resume / track change). Logout clears
 * immediately.
 */
export function useDiscordPresence(): void {
  useEffect(() => {
    if (!window.resonance?.isElectron) return;

    let cancelled = false;
    let flags: DiscordFlags | null = null;
    let lastSeenTrackId: string | null = null;
    let lastSentTrackId: string | null = null;
    let lastSentPlaying: boolean | null = null;
    let lastSentAt = 0;
    let lastSentPos = 0;
    let hadPresence = false;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPauseTimer = () => {
      if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
      }
    };

    const push = (
      track: { title: string; artist: string; coverUrl?: string },
      s: { positionMs: number; durationMs: number; isPlaying: boolean }
    ) => {
      lastSentAt = Date.now();
      lastSentPos = Math.round(s.positionMs);
      hadPresence = true;
      try {
        window.resonance?.setDiscordActivity({
          title: track.title,
          artist: track.artist,
          coverUrl: track.coverUrl ?? null,
          durationMs: s.durationMs,
          positionMs: Math.round(s.positionMs),
          isPlaying: s.isPlaying,
        });
      } catch {
        /* silent */
      }
    };

    const clear = () => {
      clearPauseTimer();
      if (!hadPresence) return;
      hadPresence = false;
      lastSentTrackId = null;
      lastSentPlaying = null;
      try {
        window.resonance?.clearDiscordActivity();
      } catch {
        /* silent */
      }
    };

    const evaluate = async () => {
      if (cancelled) return;
      const s = usePlayer.getState();
      const track = s.currentTrack();
      const trackId = track?.id ?? null;

      // Privacy flags are cached; refetched on track change so a toggle in
      // Settings takes effect without reload (toggle-off also clears
      // immediately from SettingsView itself).
      if (trackId !== lastSeenTrackId) {
        lastSeenTrackId = trackId;
        clearPauseTimer();
        flags = await fetchDiscordFlags();
        if (cancelled) return;
      }

      if (!flags) return;
      // Invisible everywhere means invisible on Discord too.
      if (!flags.discord_presence || !flags.appear_online) {
        clear();
        return;
      }

      if (!track) {
        clear();
        return;
      }

      const pos = Math.round(s.positionMs);
      const dur = s.durationMs || track.durationMs || 0;

      if (!s.isPlaying) {
        // One frozen snapshot on pause, then clear after 30s (Spotify-like).
        if (lastSentTrackId !== track.id || lastSentPlaying !== false) {
          lastSentTrackId = track.id;
          lastSentPlaying = false;
          push(track, { positionMs: pos, durationMs: dur, isPlaying: false });
        }
        if (hadPresence) {
          if (!pauseTimer) {
            pauseTimer = setTimeout(() => {
              pauseTimer = null;
              clear();
            }, PAUSE_CLEAR_MS);
          }
        }
        return;
      }

      clearPauseTimer();
      // Track change / resume: send immediately (discrete events).
      if (lastSentTrackId !== track.id || lastSentPlaying !== true) {
        lastSentTrackId = track.id;
        lastSentPlaying = true;
        push(track, { positionMs: pos, durationMs: dur, isPlaying: true });
        return;
      }
      // Steady progress: max 1 update / 5s, only when moved > 1s.
      const now = Date.now();
      if (
        now - lastSentAt >= THROTTLE_MS &&
        Math.abs(pos - lastSentPos) > PROGRESS_DELTA_MS
      ) {
        push(track, { positionMs: pos, durationMs: dur, isPlaying: true });
      }
    };

    void fetchDiscordFlags().then((f) => {
      if (cancelled) return;
      flags = f;
      void evaluate();
    });

    const unsub = usePlayer.subscribe(() => {
      void evaluate();
    });

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Sign-out flow (TopBar handleLogout): drop Discord status at once.
      if (event === "SIGNED_OUT") {
        lastSeenTrackId = null;
        lastSentTrackId = null;
        lastSentPlaying = null;
        flags = null;
        hadPresence = false;
        clearPauseTimer();
        try {
          window.resonance?.clearDiscordActivity();
        } catch {
          /* silent */
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
      subscription.unsubscribe();
      clearPauseTimer();
    };
  }, []);
}

/**
 * Main-window-only mount (Shell is not rendered on /mini — same guard as
 * MiniSync: the mini window is a remote control, playback stays here).
 * Renders nothing.
 */
export function DiscordPresence() {
  useDiscordPresence();
  return null;
}
