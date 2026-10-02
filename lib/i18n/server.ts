import "server-only";

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  dictionaries,
  isLocale,
  type Dictionary,
  type Locale,
} from "./dictionaries";
import { LOCALE_COOKIE } from "./dictionaries";

export async function getServerLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const value = store.get(LOCALE_COOKIE)?.value;
    if (isLocale(value)) return value;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export async function getServerDictionary(): Promise<{
  locale: Locale;
  t: Dictionary;
}> {
  const locale = await getServerLocale();
  return { locale, t: dictionaries[locale] };
}
