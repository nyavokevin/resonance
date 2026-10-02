"use client";

import { create } from "zustand";
import type { PlayerAdapter, AdapterState } from "@/lib/player/adapter";
import { YouTubeAdapter } from "@/lib/player/youtube";
import { SpotifyAdapter } from "@/lib/player/spotify";
import { SoundCloudAdapter } from "@/lib/player/soundcloud";
import { AppleMusicAdapter } from "@/lib/player/apple";
import { DirectAdapter } from "@/lib/player/direct";
import type { Platform, Track } from "@/lib/types";
import { toYouTubeTrack } from "@/lib/youtube-track";
import { recordHistory, saveQueueState, loadQueueState, fetchRecentTrackIds } from "@/lib/library";
import { useToasts } from "@/lib/toast-store";
import type { JamPlaybackState } from "@/lib/jam-store";
import { useJam } from "@/lib/jam-store";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { useLocaleStore } from "@/lib/i18n/locale-store";

export type RepeatMode = "off" | "all" | "one" | "times";

interface PlayerState {
  queue: Track[];
  originalQueue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  repeatCount: number;
  autoplay: boolean;
  shuffle: boolean;
  setAutoplay: (on: boolean) => void;
  queueOpen: boolean;
  queueEnded: boolean;
  jamDetached: boolean;
  jamSoft: boolean;
  jamHostPlaying: boolean;
  currentTrack: () => Track | null;
  limited: boolean;

  init: () => void;
  playTrack: (track: Track, list?: Track[]) => Promise<void>;
  addToQueue: (track: Track) => "added" | "moved";
  playNext: (track: Track) => "added" | "moved";
  sendToEnd: (index: number) => void;
  clearUpcoming: () => void;
  promoteAuto: (index: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  playAt: (index: number) => Promise<void>;
  next: (auto?: boolean) => Promise<void>;
  previous: () => Promise<void>;
  toggle: () => Promise<void>;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  setRepeatTimes: (n: number) => void;
  toggleShuffle: () => void;
  setQueueOpen: (open: boolean) => void;
  setJamDetached: (detached: boolean) => void;
  setJamSoft: (soft: boolean) => void;
  mergeJamQueue: (incoming: Track[]) => void;
  applyJamSignal: (signal: {
    trackId: string;
    isPlaying: boolean;
    positionMs: number;
    repeat: RepeatMode;
    repeatCount: number;
    ts: number;
  }) => boolean;
  rejoinJam: (state: JamPlaybackState) => Promise<void>;
  applyJamState: (state: JamPlaybackState) => Promise<void>;
  onAdapterState: (state: AdapterState) => void;
}

const ADAPTERS: Record<Platform, new () => PlayerAdapter> = {
  youtube: YouTubeAdapter,
  "youtube-music": YouTubeAdapter,
  spotify: SpotifyAdapter,
  soundcloud: SoundCloudAdapter,
  "apple-music": AppleMusicAdapter,
  direct: DirectAdapter,
};

const LIMITED: Platform[] = ["apple-music", "spotify"];
const VISIBLE_EMBEDS: Platform[] = ["spotify", "soundcloud", "apple-music"];

let adapter: PlayerAdapter | null = null;
let adapterPlatform: Platform | null = null;
let adapterTrackId: string | null = null;

function ensureContainer(platform: Platform): HTMLElement {
  const id = "resonance-embed-host";
  let el = document.getElementById(id) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  if (VISIBLE_EMBEDS.includes(platform)) {
    // Décalé après la sidebar sur desktop (comme PlayerBar / TopBar),
    // sinon l'embed passe sous le panneau (sidebar z-70 > embed z-50).
    const left =
      window.matchMedia("(min-width: 1024px)").matches ? 228 : 0;
    el.style.cssText = `position:fixed;left:${left}px;bottom:90px;width:300px;height:170px;z-index:50;`;
  } else {
    el.style.cssText =
      "position:fixed;left:-9999px;top:0;width:320px;height:180px;";
  }
  return el;
}

function destroyAdapter() {
  adapter?.destroy();
  adapter = null;
  adapterPlatform = null;
  adapterTrackId = null;
}

function getAdapter(): PlayerAdapter | null {
  return adapter;
}

// Cooldown anti-stutter : après un seek imposé par le Jam, on ignore les
// corrections de dérive suivantes le temps que l'embed se stabilise,
// sinon seek → buffering → seek → buffering en boucle.
let lastJamSeekAt = 0;

function markJamSeek() {
  lastJamSeekAt = Date.now();
}

function jamSeekCoolingDown() {
  return Date.now() - lastJamSeekAt < 3000;
}

export const usePlayer = create<PlayerState>((set, get) => {
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastEndedAt = 0;
  let lastSave = 0;
  // Rafale d'ajouts manuels consécutifs (purge AUTO au-delà de 3).
  let manualAddStreak = 0;
  // Garde anti-boucle : id du titre Spotify pour lequel le fallback
  // YouTube a déjà été tenté (évite de retomber en boucle dessus).
  let fallbackAttemptedFor: string | null = null;

  /** Sauvegarde immédiate (DnD, ajout, suppression) — sans throttle. */
  const persistNow = () => {
    lastSave = Date.now();
    const s = get();
    void saveQueueState({
      items: s.queue,
      currentIndex: s.currentIndex,
      positionMs: s.positionMs,
      isPlaying: s.isPlaying,
      volume: s.volume,
      repeat: s.repeat,
      repeatCount: s.repeatCount,
      autoplay: s.autoplay,
      shuffle: s.shuffle,
    }).catch(() => {});
  };

  const persist = () => {
    const now = Date.now();
    if (now - lastSave < 5000) return;
    lastSave = now;
    const s = get();
    void saveQueueState({
      items: s.queue,
      currentIndex: s.currentIndex,
      positionMs: s.positionMs,
      isPlaying: s.isPlaying,
      volume: s.volume,
      repeat: s.repeat,
      repeatCount: s.repeatCount,
      autoplay: s.autoplay,
      shuffle: s.shuffle,
    }).catch(() => {});
  };

  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!adapter) return;
      const position = adapter.getPositionMs();
      const duration = adapter.getDurationMs();
      set({ positionMs: position, durationMs: duration || get().durationMs });
      persist();
    }, 500);
  };

  /** Retire les pistes AUTO sauf celle en cours. */
  const stripAutoTracks = () => {
    const { queue, originalQueue, currentIndex } = get();
    const current = queue[currentIndex];
    const stripped = queue.filter((t) => !t.auto || t === current);
    const strippedOriginal = originalQueue.filter((t) => !t.auto || t === current);
    const newIndex = stripped.indexOf(current);
    set({
      queue: stripped,
      originalQueue: strippedOriginal,
      currentIndex: newIndex === -1 ? 0 : newIndex,
    });
  };

  /** Fin de la section manuelle = position d'insertion d'un titre manuel. */
  const insertManualAt = (arr: Track[], fromIndex: number): number => {
    for (let i = fromIndex + 1; i < arr.length; i++) {
      if (arr[i].auto) return i;
    }
    return arr.length;
  };

  /** Doublon (platform+trackId) dans les 20 prochaines pistes ? */
  const findDuplicateIndex = (track: Track): number => {
    const { queue, currentIndex } = get();
    const end = Math.min(currentIndex + 21, queue.length);
    for (let i = currentIndex + 1; i < end; i++) {
      const t = queue[i];
      if (
        t.platform === track.platform &&
        t.platformTrackId === track.platformTrackId
      ) {
        return i;
      }
    }
    return -1;
  };

  /** ≥3 ajouts manuels consécutifs → purge AUTO au-delà de la 15e position. */
  const trimAutoTail = () => {
    const { queue, currentIndex } = get();
    if (queue.length <= 15) return;
    const current = queue[currentIndex];
    const kept = queue.filter((t, i) => i <= 15 || !t.auto || t === current);
    if (kept.length === queue.length) return;
    const newIndex = kept.indexOf(current);
    set({
      queue: kept,
      originalQueue: kept,
      currentIndex: newIndex === -1 ? 0 : newIndex,
    });
  };

  /**
   * Radio YouTube : en fin de file (repeat off, autoplay ON), injecte
   * les recommandations "Up next" et enchaîne. Retourne false si la
   * radio ne peut pas prendre le relais (lecture doit s'arrêter).
   */
  const maybePlayRadio = async (): Promise<boolean> => {
    const s = get();
    if (!s.autoplay || s.repeat !== "off") return false;
    const jam = useJam.getState().session;
    if (jam && !jam.isHost) return false;
    const last = s.queue[s.currentIndex];
    if (!last) return false;
    if (last.platform !== "youtube" && last.platform !== "youtube-music") return false;
    if (!last.platformTrackId) return false;
    try {
      const recent = await fetchRecentTrackIds(20).catch(() => [] as string[]);
      const exclude = new Set([...s.queue.map((t) => t.id), ...recent]);
      const res = await fetch(
        `/api/radio?videoId=${encodeURIComponent(last.platformTrackId)}&exclude=${encodeURIComponent([...exclude].join(","))}`
      );
      if (!res.ok) {
        useToasts.getState().push(dictionaries[useLocaleStore.getState().locale].engine.radioUnavailable, "info");
        return false;
      }
      const data = await res.json();
      const tracks = (data.tracks ?? []) as Track[];
      if (!tracks.length) return false;
      set({
        queue: [...get().queue, ...tracks],
        originalQueue: [...get().originalQueue, ...tracks],
      });
      manualAddStreak = 0;
      persistNow();
      await loadAndPlay(get().currentIndex + 1, true);
      useToasts.getState().push(dictionaries[useLocaleStore.getState().locale].engine.radioStarted, "success");
      return true;
    } catch {
      useToasts.getState().push(dictionaries[useLocaleStore.getState().locale].engine.radioUnavailable, "info");
      return false;
    }
  };

  /**
   * Fallback Spotify → YouTube : quand un titre Spotify est illisible
   * dans l'embed (restriction régionale, retrait du catalogue...), on
   * cherche l'équivalent sur YouTube et on le joue à la place, en
   * conservant sa position dans la file. Jamais de preview démo :
   * lecture intégrale via l'adapter YouTube. En cas d'échec on avance.
   */
  const playYouTubeFallback = async (track: Track): Promise<void> => {
    try {
      // Mode YouTube forcé : le fallback a besoin de videoIds, pas de groupes Spotify.
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(`${track.title} ${track.artist}`)}&source=youtube`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const first = (data.results ?? [])[0] as
        | {
            videoId: string;
            title: string;
            channel: string;
            durationMs?: number;
            thumbnail?: string;
          }
        | undefined;
      if (!first?.videoId) throw new Error();
      const yt: Track = toYouTubeTrack(first, {
        title: track.title,
        artist: track.artist,
        coverUrl: track.coverUrl,
        durationMs: track.durationMs,
        isrc: track.isrc,
        album: track.album,
        appleMusicUrl: track.appleMusicUrl,
      });
      const { queue, originalQueue, currentIndex } = get();
      // L'utilisateur a pu changer de piste pendant la recherche.
      const stillCurrent = queue[currentIndex];
      if (!stillCurrent || stillCurrent.id !== track.id) return;
      set({
        queue: queue.map((t, i) => (i === currentIndex ? yt : t)),
        originalQueue: originalQueue.map((t) => (t.id === track.id ? yt : t)),
      });
      useToasts.getState().push(
        dictionaries[useLocaleStore.getState().locale].engine.spotifyFallback,
        "info"
      );
      await loadAndPlay(currentIndex, true);
    } catch {
      void get().next(true);
    }
  };

  const loadAndPlay = async (index: number, autoplay: boolean) => {
    const { queue, volume, muted } = get();
    const track = queue[index];
    if (!track) return;

    const isNewPlatform = track.platform !== adapterPlatform;
    const isNewTrack = track.id !== adapterTrackId;

    if (isNewPlatform || isNewTrack) {
      destroyAdapter();
      fallbackAttemptedFor = null;
      const AdapterClass = ADAPTERS[track.platform];
      adapter = new AdapterClass();
      adapterPlatform = track.platform;
      adapterTrackId = track.id;
      adapter.on((state) => get().onAdapterState(state));
      set({
        currentIndex: index,
        positionMs: 0,
        durationMs: track.durationMs ?? 0,
        limited: LIMITED.includes(track.platform),
      });
      const container = ensureContainer(track.platform);
      container.innerHTML = "";
      await adapter.mount(container, track, autoplay);
      adapter.setVolume(muted ? 0 : volume);
      if (!autoplay) adapter.pause();
    } else if (autoplay) {
      adapter?.play();
    }

    set({ isPlaying: autoplay, queueEnded: false });
    startPolling();
  };

  return {
    queue: [],
    originalQueue: [],
    currentIndex: -1,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    volume: 0.8,
    muted: false,
    repeat: "off",
    repeatCount: 0,
    autoplay: true,
    shuffle: false,
    queueOpen: true,
    queueEnded: false,
    jamDetached: false,
    jamSoft: false,
    jamHostPlaying: false,
    limited: false,

    currentTrack: () => {
      const { queue, currentIndex } = get();
      return queue[currentIndex] ?? null;
    },

    init: () => {
      startPolling();
      void loadQueueState()
        .then((state) => {
          if (!state) return;
          set({
            queue: state.items,
            originalQueue: state.items,
            currentIndex: Math.min(state.currentIndex, state.items.length - 1),
            positionMs: state.positionMs,
            volume: state.volume,
            repeat: state.repeat,
            repeatCount: state.repeatCount,
            autoplay: state.autoplay,
            shuffle: state.shuffle,
            isPlaying: false,
            durationMs: state.items[Math.min(state.currentIndex, state.items.length - 1)]?.durationMs ?? 0,
          });
        })
        .catch(() => {});
    },

    playTrack: async (track, list) => {
      // Un invité qui lance sa propre musique se détache du live du host
      // (sinon le heartbeat du host force-pause sa lecture dans les 5s).
      // Il peut revenir au live via le bouton "Go Live".
      const jam = useJam.getState().session;
      if (jam && !jam.isHost && !get().jamDetached) {
        set({ jamDetached: true });
      }
      const queue = list ?? [track];
      const original = [...queue];
      const index = queue.findIndex((t) => t.id === track.id);
      set({ queue, originalQueue: original });
      await loadAndPlay(index === -1 ? 0 : index, true);
      await recordHistory(queue[index === -1 ? 0 : index]).catch(() => {});
    },

    addToQueue: (track) => {
      const { queue, currentIndex } = get();
      const dup = findDuplicateIndex(track);
      const next = [...queue];
      let status: "added" | "moved" = "added";
      if (dup !== -1) {
        const [moved] = next.splice(dup, 1);
        next.splice(insertManualAt(next, currentIndex), 0, {
          ...moved,
          auto: undefined,
        });
        status = "moved";
      } else {
        next.splice(insertManualAt(next, currentIndex), 0, track);
        manualAddStreak += 1;
      }
      set({
        queue: next,
        originalQueue:
          status === "added"
            ? [...get().originalQueue, track]
            : get().originalQueue,
        currentIndex,
      });
      if (manualAddStreak >= 3) trimAutoTail();
      persistNow();
      return status;
    },

    playNext: (track) => {
      const { queue, currentIndex } = get();
      const dup = findDuplicateIndex(track);
      const next = [...queue];
      let status: "added" | "moved";
      if (dup !== -1) {
        const [moved] = next.splice(dup, 1);
        next.splice(currentIndex + 1, 0, { ...moved, auto: undefined });
        status = "moved";
      } else {
        next.splice(currentIndex + 1, 0, track);
        status = "added";
      }
      set({
        queue: next,
        originalQueue:
          status === "added"
            ? [...get().originalQueue, track]
            : get().originalQueue,
        currentIndex,
        queueEnded: false,
      });
      persistNow();
      return status;
    },

    sendToEnd: (index) => {
      const { queue, currentIndex } = get();
      if (index <= currentIndex || index >= queue.length) return;
      const next = [...queue];
      const [moved] = next.splice(index, 1);
      next.splice(insertManualAt(next, currentIndex), 0, {
        ...moved,
        auto: undefined,
      });
      set({ queue: next, originalQueue: next, currentIndex });
      persistNow();
    },

    clearUpcoming: () => {
      const { queue, currentIndex } = get();
      // Retire les manuels à venir ; la section AUTO (C) reste en place.
      const kept = queue
        .slice(0, currentIndex + 1)
        .concat(queue.slice(currentIndex + 1).filter((t) => t.auto));
      set({ queue: kept, originalQueue: kept, currentIndex });
      manualAddStreak = 0;
      persistNow();
    },

    promoteAuto: (index) => {
      const { queue, currentIndex } = get();
      if (index <= currentIndex || index >= queue.length) return;
      const next = [...queue];
      const [moved] = next.splice(index, 1);
      next.splice(insertManualAt(next, currentIndex), 0, {
        ...moved,
        auto: undefined,
      });
      set({ queue: next, originalQueue: next, currentIndex });
      persistNow();
    },

    removeFromQueue: (index) => {
      const { queue, currentIndex } = get();
      if (index === currentIndex) return;
      const newQueue = queue.filter((_, i) => i !== index);
      set({
        queue: newQueue,
        currentIndex: index < currentIndex ? currentIndex - 1 : currentIndex,
      });
      persistNow();
    },

    reorderQueue: (from, to) => {
      const { queue, currentIndex } = get();
      const newQueue = [...queue];
      const [moved] = newQueue.splice(from, 1);
      newQueue.splice(to, 0, moved);
      let newIndex = currentIndex;
      if (from === currentIndex) newIndex = to;
      else if (from < currentIndex && to >= currentIndex) newIndex = currentIndex - 1;
      else if (from > currentIndex && to <= currentIndex) newIndex = currentIndex + 1;
      set({ queue: newQueue, currentIndex: newIndex });
      persistNow();
    },

    playAt: async (index) => loadAndPlay(index, true),

    next: async (auto = false) => {
      const { queue, currentIndex, repeat, repeatCount, shuffle } = get();
      if (repeat === "one" && auto) {
        adapter?.seek(0);
        adapter?.play();
        return;
      }
      if (repeat === "times" && auto) {
        // ×N = N lectures totales : on décrémente à chaque fin naturelle.
        if (repeatCount > 1) {
          set({ repeatCount: repeatCount - 1 });
          adapter?.seek(0);
          adapter?.play();
          return;
        }
        // Compteur épuisé : on enchaîne et on repasse en off.
        set({ repeat: "off", repeatCount: 0 });
      }
      if (shuffle) {
        const others = queue
          .map((_, i) => i)
          .filter((i) => i !== currentIndex);
        if (others.length === 0) return;
        const pick = others[Math.floor(Math.random() * others.length)];
        await loadAndPlay(pick, true);
        return;
      }
      const nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeat === "all" && queue.length > 0) {
          await loadAndPlay(0, true);
        } else if (auto) {
          const continued = await maybePlayRadio();
          if (!continued) set({ isPlaying: false, queueEnded: true });
        }
        return;
      }
      // L'invariant de file (manuels avant AUTO) fait la promotion
      // automatique : le morceau suivant est la 1re AUTO si B est vide.
      await loadAndPlay(nextIndex, true);
    },

    previous: async () => {
      const { currentIndex, positionMs } = get();
      if (positionMs > 3000) {
        adapter?.seek(0);
        return;
      }
      if (currentIndex > 0) await loadAndPlay(currentIndex - 1, true);
      else adapter?.seek(0);
    },

    toggle: async () => {
      const { isPlaying, queue, currentIndex } = get();
      if (!adapter) {
        if (queue.length > 0) {
          const jam = useJam.getState().session;
          if (jam && !jam.isHost) set({ jamSoft: true });
          await loadAndPlay(Math.max(currentIndex, 0), true);
        }
        return;
      }
      // Pause/lecture locale d'un invité sur le morceau du Jam → mode soft
      // (contrôle local, le live du host continue ; "Go Live" pour se recaler).
      const jam = useJam.getState().session;
      if (jam && !jam.isHost) {
        set({ jamSoft: true });
      }
      if (isPlaying) adapter.pause();
      else adapter.play();
      set({ isPlaying: !isPlaying });
    },

    seek: (ms) => {
      adapter?.seek(ms);
      set({ positionMs: ms });
    },

    setVolume: (v) => {
      const { muted } = get();
      adapter?.setVolume(muted ? 0 : v);
      set({ volume: v, muted: v === 0 ? true : muted });
    },

    toggleMute: () => {
      const { muted, volume } = get();
      adapter?.setVolume(muted ? volume : 0);
      set({ muted: !muted });
    },

    cycleRepeat: () => {
      const { repeat } = get();
      set({
        repeat: repeat === "off" ? "all" : repeat === "all" ? "one" : "off",
        repeatCount: 0,
      });
    },

    setRepeatTimes: (n: number) => {
      const count = Math.max(1, Math.min(99, Math.floor(n)));
      set({ repeat: "times", repeatCount: count });
    },

    toggleShuffle: () => {
      const { shuffle, queue, originalQueue, currentIndex, currentTrack } = get();
      if (!shuffle) {
        const current = currentTrack();
        const shuffled = [...queue].sort(() => Math.random() - 0.5);
        set({
          shuffle: true,
          queue: shuffled,
          currentIndex: current ? shuffled.findIndex((t) => t.id === current.id) : 0,
        });
      } else {
        const current = currentTrack();
        const restored = originalQueue.length === queue.length ? originalQueue : queue;
        set({
          shuffle: false,
          queue: restored,
          currentIndex: current ? restored.findIndex((t) => t.id === current.id) : currentIndex,
        });
      }
    },

    setQueueOpen: (open) => set({ queueOpen: open }),

    setAutoplay: (on) => {
      if (!on) {
        set({ autoplay: false });
        stripAutoTracks();
      } else {
        set({ autoplay: true });
      }
    },

    setJamDetached: (detached) =>
      set({ jamDetached: detached, jamSoft: false, jamHostPlaying: detached ? get().jamHostPlaying : false }),

    setJamSoft: (soft) => set({ jamSoft: soft }),

    mergeJamQueue: (incoming) => {
      const s = get();
      const ids = new Set(s.queue.map((t) => t.id));
      const additions = incoming.filter((t) => !ids.has(t.id));
      if (additions.length === 0) return;
      set({
        queue: [...s.queue, ...additions],
        originalQueue: [...s.originalQueue, ...additions],
      });
    },

    applyJamSignal: (signal) => {
      const s = get();
      if (s.jamDetached) return true;
      const current = s.currentTrack();
      // Piste différente ou adapter absent : le signal léger ne suffit pas,
      // l'appelant doit retomber sur l'état complet (fetch + applyJamState).
      if (!current || current.id !== signal.trackId || !adapter) return false;

      if (s.jamSoft) {
        // Invité en mode soft : il ignore le live (lecture, pause, position).
        // "Go Live" (visible dès que jamSoft est actif) le recale manuellement.
        set({
          jamHostPlaying: signal.isPlaying,
          repeat: signal.repeat,
          repeatCount: signal.repeatCount,
        });
        return true;
      }

      // Mémoriser l'intention du host AVANT d'agir sur l'embed, pour que
      // onAdapterState puisse distinguer un vrai démarrage d'un événement
      // parasite (buffering recovery) qui contredirait le host.
      // Le mode repeat du host est adopté (contrôle verrouillé pour l'invité).
      set({
        jamHostPlaying: signal.isPlaying,
        repeat: signal.repeat,
        repeatCount: signal.repeatCount,
      });

      if (!signal.isPlaying && s.isPlaying) {
        // Le host met en pause → on suit. Reprise du host → jamais de
        // démarrage auto : l'invité en pause revient via "Go Live".
        adapter.pause();
        set({ isPlaying: false });
      }

      if (signal.isPlaying && get().isPlaying) {
        const latency = Math.max(0, Date.now() - signal.ts);
        const target = signal.positionMs + Math.min(latency, 2000);
        const local = adapter.getPositionMs();
        if (!jamSeekCoolingDown() && Math.abs(target - local) > 2000) {
          adapter.seek(target);
          markJamSeek();
        }
      }

      // La position affichée suit l'embed local (polling) : on ne la force
      // pas ici pour éviter un flicker de seekbar chez un invité en pause.
      return true;
    },

    rejoinJam: async (state) => {
      destroyAdapter();
      set({
        queue: state.queue,
        originalQueue: state.queue,
        currentIndex: state.currentIndex,
        jamDetached: false,
        jamSoft: false,
        jamHostPlaying: state.isPlaying,
        repeat: state.repeat,
        repeatCount: state.repeatCount,
      });
      await loadAndPlay(state.currentIndex, state.isPlaying);
      // Seek seulement si le host joue : seekTo pendant la pause
      // déclenche la lecture sur certains embeds (SoundCloud).
      if (state.isPlaying) {
        const latencyMs =
          state.updatedAt
            ? Math.max(0, Date.now() - Date.parse(state.updatedAt))
            : 0;
        const targetMs = state.positionMs + Math.min(latencyMs, 2000);
        if (targetMs > 250) {
          getAdapter()?.seek(targetMs);
          markJamSeek();
        }
      }
      set({ positionMs: state.positionMs, isPlaying: state.isPlaying });
    },

    applyJamState: async (state) => {
      const s = get();
      const detached = s.jamDetached;

      // Invité détaché (écoute son propre morceau) : ignorer complètement
      // les états du host — pas de rechargement de piste, pas de pause
      // forcée. Il revient au live via rejoinJam ("Go Live").
      if (detached) return;

      const track = state.queue[state.currentIndex] ?? null;
      const current = s.currentTrack();
      const trackChanged = !track || !current || current.id !== track.id;

      set({
        jamHostPlaying: state.isPlaying,
        repeat: state.repeat,
        repeatCount: state.repeatCount,
      });

      if (s.jamSoft) {
        if (!trackChanged && adapter) return;
        // Re-ancrage : nouveau morceau du host (ou embed absente) — on
        // charge avec l'intention locale de lecture, jamais de démarrage
        // surprise ("Go Live" affiche l'état du host).
        const autoplay = s.isPlaying;
        set({
          jamSoft: false,
          queue: state.queue,
          originalQueue: state.queue,
          currentIndex: state.currentIndex,
        });
        await loadAndPlay(state.currentIndex, autoplay);
        if (autoplay) {
          const latencyMs =
            state.updatedAt
              ? Math.max(0, Date.now() - Date.parse(state.updatedAt))
              : 0;
          const targetMs = state.positionMs + Math.min(latencyMs, 2000);
          if (targetMs > 250) {
            getAdapter()?.seek(targetMs);
            markJamSeek();
          }
          set({ positionMs: state.positionMs });
        }
        set({ isPlaying: autoplay });
        return;
      }

      const latencyMs =
        state.updatedAt && state.isPlaying
          ? Math.max(0, Date.now() - Date.parse(state.updatedAt))
          : 0;
      const targetMs = state.positionMs + Math.min(latencyMs, 2000);

      if (track && (trackChanged || !adapter)) {
        set({ queue: state.queue, originalQueue: state.queue, currentIndex: state.currentIndex });
        // Pas de démarrage surprise : on ne joue que si l'invité jouait
        // déjà (continuation) ou s'il rejoint sans embed (join frais).
        const autoplay = state.isPlaying && (s.isPlaying || !adapter);
        await loadAndPlay(state.currentIndex, autoplay);
        // Seek seulement pendant la lecture : sur certains embeds (SoundCloud)
        // seekTo pendant la pause déclenche la lecture.
        if (autoplay && targetMs > 250) {
          getAdapter()?.seek(targetMs);
          markJamSeek();
        }
      } else if (track && adapter) {
        // Suivre uniquement la pause du host ; jamais de démarrage auto
        // (reprise → "Go Live").
        if (!state.isPlaying && s.isPlaying) {
          adapter.pause();
          set({ isPlaying: false });
        }
        // Correction de dérive uniquement en lecture (même raison),
        // avec cooldown anti-stutter après un seek Jam.
        if (state.isPlaying && get().isPlaying) {
          const localPos = adapter.getPositionMs();
          if (!jamSeekCoolingDown() && Math.abs(targetMs - localPos) > 2000) {
            adapter.seek(targetMs);
            markJamSeek();
          }
        }
      } else if (!track) {
        if (adapter) {
          destroyAdapter();
        }
      }

      set({
        queue: state.queue,
        originalQueue: state.queue,
        currentIndex: state.currentIndex,
      });
      // Même raison : la position affichée suit l'embed local quand en pause.
      if (get().isPlaying) {
        set({ positionMs: state.positionMs });
      }
    },

    onAdapterState: (state) => {
      // Invité en Jam synchronisé (ni détaché, ni soft) : la progression
      // appartient au host. Sans ce garde, un embed qui signale
      // "ended"/"unavailable" au chargement fait démarrer la lecture chez
      // l'invité alors que le host est en pause.
      const jam = useJam.getState().session;
      const guestSynced = Boolean(
        jam && !jam.isHost && !get().jamDetached && !get().jamSoft
      );

      if (state === "ended") {
        if (guestSynced) {
          set({ isPlaying: false });
          return;
        }
        const now = Date.now();
        if (now - lastEndedAt < 1000) return;
        lastEndedAt = now;
        void get().next(true);
      } else if (state === "playing") {
        // Invité synchronisé : un événement "playing" parasite de l'embed
        // (reprise après buffering, autoplay) contredit le host en pause —
        // on remet l'embed en pause pour respecter le live.
        if (guestSynced && !get().jamHostPlaying) {
          getAdapter()?.pause();
          return;
        }
        set({ isPlaying: true });
      } else if (state === "paused") {
        set({ isPlaying: false });
      } else if (state === "unavailable") {
        set({ isPlaying: false });
        if (guestSynced) return;
        const current = get().currentTrack();
        if (
          current &&
          current.platform === "spotify" &&
          fallbackAttemptedFor !== current.id
        ) {
          fallbackAttemptedFor = current.id;
          void playYouTubeFallback(current);
          return;
        }
        void get().next(true);
      }
    },
  };
});
