"use client";

import { useEffect } from "react";
import { useJam, type JamPlaybackState } from "@/lib/jam-store";
import {
  pushJamState,
  subscribeJam,
  fetchJamState,
  restoreJamSession,
  type JamChannelHandle,
} from "@/lib/jam";
import { usePlayer } from "@/lib/player/engine";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/locale-store";

export function JamController() {
  const locale = useLocale();
  const session = useJam((s) => s.session);
  const setParticipants = useJam((s) => s.setParticipants);
  const setMe = useJam((s) => s.setMe);
  const setSession = useJam((s) => s.setSession);

  useEffect(() => {
    if (useJam.getState().session) return;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const restored = await restoreJamSession(user.id).catch(() => null);
      if (restored) {
        setSession(restored);
        if (!restored.isHost) {
          const state = await fetchJamState(restored.id).catch(() => null);
          if (state?.queue.length) {
            await usePlayer.getState().applyJamState(state);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;

    const supabase = createClient();
    let cancelled = false;
    let pushDebounce: ReturnType<typeof setTimeout> | null = null;
    let signalDebounce: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    async function start(): Promise<() => void> {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return () => {};

      usePlayer.getState().setJamDetached(false);

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      const name =
        profile?.display_name?.trim() ||
        user.email?.split("@")[0]?.trim() ||
        (locale === "en" ? "Guest" : "Invité");
      setMe({ id: user.id, name });

      const isHost = session!.isHost;

      if (!isHost) {
        void fetchJamState(session!.id)
          .then((state) => {
            if (state?.queue.length) {
              return usePlayer.getState().applyJamState(state);
            }
          })
          .catch(() => {});
      }

      const channel: JamChannelHandle = subscribeJam(
        session!.id,
        user.id,
        name,
        (incoming) => {
          if (isHost) {
            // Le host est la source de vérité pour la lecture : il ne
            // réapplique jamais son propre état (sinon oscillation), il
            // fusionne uniquement les titres ajoutés par les invités.
            usePlayer.getState().mergeJamQueue(incoming.queue);
            return;
          }
          void usePlayer.getState().applyJamState(incoming);
        },
        (participants) => {
          useJam.getState().setParticipants(participants);
        },
        (signal) => {
          if (isHost) return;
          const applied = usePlayer.getState().applyJamSignal(signal);
          if (!applied) {
            // Changement de piste ou adapter absent : on retombe sur
            // l'état complet depuis la base.
            void fetchJamState(session!.id)
              .then((state) => {
                if (state?.queue.length) {
                  return usePlayer.getState().applyJamState(state);
                }
              })
              .catch(() => {});
          }
        }
      );

      // Chaque client publie le morceau qu'il écoute en ce moment
      // (affiché dans la liste des participants).
      let lastPresenceTrackId: string | null | undefined = undefined;
      const reportTrack = () => {
        const t = usePlayer.getState().currentTrack();
        const id = t?.id ?? null;
        if (id === lastPresenceTrackId) return;
        lastPresenceTrackId = id;
        channel.updatePresence({
          name,
          track: t ? { title: t.title, artist: t.artist } : null,
        });
      };
      const unreport = usePlayer.subscribe(() => reportTrack());
      reportTrack();

      if (isHost) {
        // Fast path : broadcast WebSocket (~100ms) pour play/pause/seek.
        const broadcastSignal = () => {
          const s = usePlayer.getState();
          const track = s.currentTrack();
          channel.sendSignal({
            trackId: track?.id ?? "",
            isPlaying: s.isPlaying,
            positionMs: s.positionMs,
            repeat: s.repeat,
            repeatCount: s.repeatCount,
            ts: Date.now(),
          });
        };

        // Slow path : checkpoint DB (late joiners, reconnects, queue).
        const pushDb = () => {
          const s = usePlayer.getState();
          const outgoing: JamPlaybackState = {
            queue: s.queue,
            currentIndex: s.currentIndex,
            positionMs: s.positionMs,
            isPlaying: s.isPlaying,
            repeat: s.repeat,
            repeatCount: s.repeatCount,
          };
          void pushJamState(session!.id, outgoing).catch(() => {});
        };

        const scheduleSignal = () => {
          if (signalDebounce) clearTimeout(signalDebounce);
          signalDebounce = setTimeout(broadcastSignal, 20);
        };

        const schedulePush = () => {
          if (pushDebounce) clearTimeout(pushDebounce);
          pushDebounce = setTimeout(pushDb, 400);
        };

        const unwatch = usePlayer.subscribe((state, prev) => {
          const significant =
            state.queue !== prev.queue ||
            state.currentIndex !== prev.currentIndex ||
            state.isPlaying !== prev.isPlaying ||
            state.repeat !== prev.repeat ||
            state.repeatCount !== prev.repeatCount ||
            Math.abs(state.positionMs - prev.positionMs) >= 1000;
          if (significant) {
            scheduleSignal();
            schedulePush();
          }
        });

        heartbeat = setInterval(pushDb, 5000);
        pushDb();

        return () => {
          unwatch();
          if (pushDebounce) clearTimeout(pushDebounce);
          if (signalDebounce) clearTimeout(signalDebounce);
          unreport();
          channel.unsubscribe();
        };
      }

      return () => {
        unreport();
        channel.unsubscribe();
      };
    }

    let cleanup: (() => void) | null = null;
    void start().then((c) => {
      cleanup = c;
    });

    return () => {
      cancelled = true;
      cleanup?.();
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [session, setParticipants, setMe, locale]);

  return null;
}
