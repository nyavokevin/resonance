"use client";

import { Check, Languages } from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import { useLocaleStore, useT } from "@/lib/i18n/locale-store";
import type { Locale } from "@/lib/i18n/dictionaries";

export function SettingsView() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const push = useToasts((s) => s.push);

  function handleSelect(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    // Toast in the newly selected language for instant feedback.
    push(
      next === "fr" ? "Français activé ✓" : "English enabled ✓",
      "success"
    );
  }

  const options: Array<{
    value: Locale;
    title: string;
    hint: string;
    flag: string;
  }> = [
    {
      value: "fr",
      title: t.settings.french,
      hint: t.settings.frenchHint,
      flag: "FR",
    },
    {
      value: "en",
      title: t.settings.english,
      hint: t.settings.englishHint,
      flag: "EN",
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <section>
        <h1 className="font-display text-[24px] font-bold text-white tracking-tight">
          {t.settings.title}
        </h1>
        <p className="text-ink-soft text-[13px] mt-0.5">{t.settings.subtitle}</p>
      </section>

      <section className="rounded-card border border-edge bg-panel p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-card bg-accent/15 text-accent">
            <Languages size={17} />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              {t.settings.languageTitle}
            </h2>
            <p className="text-[12px] text-ink-muted">
              {t.settings.languageDescription}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t.settings.languageTitle}>
          {options.map((opt) => {
            const active = locale === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={active}
                onClick={() => handleSelect(opt.value)}
                className={`flex items-center gap-3 rounded-card border p-3 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-edge bg-card hover:bg-hover"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-card text-[12px] font-bold ${
                    active
                      ? "bg-accent text-white"
                      : "bg-base text-ink-soft border border-edge"
                  }`}
                >
                  {opt.flag}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-white">
                    {opt.title}
                  </span>
                  <span className="block text-[12px] text-ink-muted truncate">
                    {opt.hint}
                  </span>
                </span>
                {active && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-accent shrink-0">
                    <Check size={14} />
                    {t.settings.current}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
