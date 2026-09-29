"use client";

import { create } from "zustand";

export interface SearchHistoryEntry {
  query: string;
  at: number;
}

const HISTORY_KEY = "resonance:search-history";
const MAX_HISTORY = 8;

interface SearchState {
  /** Requête partagée entre la barre du header et la page /search. */
  query: string;
  setQuery: (q: string) => void;
  history: SearchHistoryEntry[];
  loadHistory: () => void;
  remember: (q: string) => void;
  removeHistory: (q: string) => void;
  clearHistory: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  setQuery: (q) => set({ query: q }),
  history: [],
  loadHistory: () => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      set({ history: raw ? JSON.parse(raw) : [] });
    } catch {
      set({ history: [] });
    }
  },
  remember: (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const next = [
      { query: trimmed, at: Date.now() },
      ...get().history.filter((h) => h.query !== trimmed),
    ].slice(0, MAX_HISTORY);
    set({ history: next });
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // stockage indisponible
    }
  },
  removeHistory: (q) => {
    const next = get().history.filter((h) => h.query !== q);
    set({ history: next });
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // stockage indisponible
    }
  },
  clearHistory: () => {
    set({ history: [] });
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // stockage indisponible
    }
  },
}));