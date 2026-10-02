import { fr, type FrDict } from "./fr";
import { en } from "./en";

export type Locale = "fr" | "en";
export type Dictionary = FrDict;

export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "resonance-locale";
export const LOCALE_STORAGE_KEY = "resonance-locale";

export const dictionaries: Record<Locale, Dictionary> = { fr, en };

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

export function detectLocaleFromNavigator(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language?.toLowerCase() ?? "";
  return lang.startsWith("en") ? "en" : "fr";
}

/** Replace {placeholders} in a template. Handles {s} plural helper via `s` or count `n`. */
export function fmt(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  // Handle French/English plural "{s}" marker: caller passes s: "s" | ""
  return out;
}

/** Shorthand for plural suffix: n > 1 ? "s" : "" */
export function plural(n: number): string {
  return n > 1 ? "s" : "";
}
