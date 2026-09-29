"use client";

import { create } from "zustand";
import type { Track } from "@/lib/types";

export type JamRepeatMode = "off" | "all" | "one" | "times";

export interface JamTrackMeta {
  title: string;
  artist: string;
}

export interface JamParticipant {
  id: string;
  name: string;
  track?: JamTrackMeta | null;
}

export interface JamSession {
  id: string;
  code: string;
  isHost: boolean;
}

export interface JamPlaybackState {
  queue: Track[];
  currentIndex: number;
  positionMs: number;
  isPlaying: boolean;
  repeat: JamRepeatMode;
  repeatCount: number;
  updatedAt?: string;
}

export const JAM_STORAGE_KEY = "resonance:jam-session";

interface JamStore {
  session: JamSession | null;
  participants: JamParticipant[];
  me: JamParticipant | null;
  setSession: (session: JamSession | null) => void;
  setParticipants: (participants: JamParticipant[]) => void;
  setMe: (me: JamParticipant | null) => void;
}

export const useJam = create<JamStore>((set) => ({
  session: null,
  participants: [],
  me: null,
  setSession: (session) => {
    set({ session });
    try {
      if (session) {
        localStorage.setItem(JAM_STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(JAM_STORAGE_KEY);
      }
    } catch {
      // stockage indisponible
    }
  },
  setParticipants: (participants) => set({ participants }),
  setMe: (me) => set({ me }),
}));
