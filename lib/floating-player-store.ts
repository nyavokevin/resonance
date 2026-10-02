"use client";

import { create } from "zustand";

export interface FloatingPosition {
  x: number;
  y: number;
}

interface FloatingPlayerState {
  visible: boolean;
  position: FloatingPosition | null;
  hasBeenDragged: boolean;
  hydrated: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  setPosition: (pos: FloatingPosition) => void;
  load: () => void;
}

const STORAGE_KEY = "resonance-floating-player";

interface StoredState {
  visible?: unknown;
  position?: unknown;
  hasBeenDragged?: unknown;
}

function isValidPosition(value: unknown): value is FloatingPosition {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as { x: unknown; y: unknown };
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y)
  );
}

function readStored(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredState;
  } catch {
    return {};
  }
}

function persist(visible: boolean, position: FloatingPosition | null, hasBeenDragged: boolean) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ visible, position, hasBeenDragged })
    );
  } catch {
    /* storage unavailable — keep in-memory state */
  }
}

export const useFloatingPlayer = create<FloatingPlayerState>((set, get) => ({
  visible: false,
  position: null,
  hasBeenDragged: false,
  hydrated: false,
  show: () => {
    const { position, hasBeenDragged } = get();
    persist(true, position, hasBeenDragged);
    set({ visible: true });
  },
  hide: () => {
    const { position, hasBeenDragged } = get();
    persist(false, position, hasBeenDragged);
    set({ visible: false });
  },
  toggle: () => {
    const { visible, position, hasBeenDragged } = get();
    persist(!visible, position, hasBeenDragged);
    set({ visible: !visible });
  },
  setPosition: (pos) => {
    const { visible } = get();
    persist(visible, pos, true);
    set({ position: pos, hasBeenDragged: true });
  },
  load: () => {
    if (get().hydrated) return;
    const stored = readStored();
    set({
      visible: stored.visible === true,
      position: isValidPosition(stored.position) ? stored.position : null,
      hasBeenDragged: stored.hasBeenDragged === true,
      hydrated: true,
    });
  },
}));

/**
 * Platform-aware toggle: in the desktop app, open the real always-on-top
 * mini window (and hide the main one); in the browser, toggle the in-app
 * floating overlay.
 */
export function toggleFloatingMode() {
  if (
    typeof window !== "undefined" &&
    window.resonance?.isElectron &&
    window.resonance.openMiniWindow
  ) {
    window.resonance.openMiniWindow();
  } else {
    useFloatingPlayer.getState().toggle();
  }
}
