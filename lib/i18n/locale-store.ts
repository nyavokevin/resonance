"use client";

import { useEffect } from "react";
import { create } from "zustand";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  detectLocaleFromNavigator,
  dictionaries,
  isLocale,
  type Dictionary,
  type Locale,
} from "./dictionaries";

interface LocaleState {
  locale: Locale;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  init: () => void;
}

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`)
  );
  const cookieVal = match ? decodeURIComponent(match[1]) : null;
  if (isLocale(cookieVal)) return cookieVal;
  return null;
}

function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: DEFAULT_LOCALE,
  hydrated: false,
  setLocale: (locale) => {
    persistLocale(locale);
    set({ locale });
  },
  init: () => {
    if (get().hydrated) return;
    const stored = readStoredLocale();
    const locale = stored ?? detectLocaleFromNavigator();
    persistLocale(locale);
    set({ locale, hydrated: true });
  },
}));

/** Ensure locale is initialized once per app lifetime (call from Shell). */
export function useInitLocale() {
  const init = useLocaleStore((s) => s.init);
  useEffect(() => {
    init();
  }, [init]);
}

/** Current dictionary for the active locale. */
export function useDictionary(): Dictionary {
  const locale = useLocaleStore((s) => s.locale);
  return dictionaries[locale];
}

/** Alias kept short for call sites: const t = useT(); t.sidebar.home */
export function useT(): Dictionary {
  return useDictionary();
}

export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}
