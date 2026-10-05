"use client";

import { useEffect, useState } from "react";
import { Check, Languages, ShieldCheck } from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import { useLocaleStore, useT } from "@/lib/i18n/locale-store";
import type { Locale } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/client";
import { untrackPresence } from "@/lib/presence";
import type { ProfilePrivacy } from "@/lib/social";

type PrivacyKey = keyof ProfilePrivacy;

function PrivacyToggle({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-card border border-edge bg-card hover:bg-hover p-3 text-left transition-colors disabled:opacity-60"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-white">{title}</span>
        <span className="block text-[12px] text-ink-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-base border border-edge"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function SettingsView() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const push = useToasts((s) => s.push);

  const [userId, setUserId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<ProfilePrivacy | null>(null);
  const [saving, setSaving] = useState<PrivacyKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled || !auth.user?.id) return;
      setUserId(auth.user.id);
      const { data } = await supabase
        .from("profiles")
        .select("share_listening_activity, allow_friend_requests, appear_online, discord_presence")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = (data ?? {}) as Partial<ProfilePrivacy>;
      setPrivacy({
        share_listening_activity: row.share_listening_activity ?? true,
        allow_friend_requests: row.allow_friend_requests ?? true,
        appear_online: row.appear_online ?? true,
        discord_presence: row.discord_presence ?? true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updatePrivacy(key: PrivacyKey, value: boolean) {
    if (!userId || saving) return;
    setSaving(key);
    try {
      const { error } = await createClient()
        .from("profiles")
        .update({ [key]: value })
        .eq("id", userId);
      if (error) {
        push(t.common.operationImpossible, "error");
        return;
      }
      setPrivacy((prev) => (prev ? { ...prev, [key]: value } : prev));
      push(t.settings.privacy.saved, "success");
      // Invisible immédiatement : on quitte la présence sans attendre.
      if (key === "appear_online" && !value) untrackPresence();
      // Discord OFF : efface le statut Discord aussitôt (main process).
      if (key === "discord_presence" && !value) {
        try {
          window.resonance?.clearDiscordActivity();
        } catch {
          /* non-Electron : rien à effacer */
        }
      }
    } finally {
      setSaving(null);
    }
  }

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

      <section className="rounded-card border border-edge bg-panel p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-card bg-accent/15 text-accent">
            <ShieldCheck size={17} />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              {t.settings.privacy.title}
            </h2>
          </div>
        </div>

        <div className="grid gap-2">
          <PrivacyToggle
            title={t.settings.privacy.shareActivity}
            hint={t.settings.privacy.shareActivityHint}
            checked={privacy?.share_listening_activity ?? true}
            disabled={!privacy || saving !== null}
            onChange={(v) => void updatePrivacy("share_listening_activity", v)}
          />
          <PrivacyToggle
            title={t.settings.privacy.allowRequests}
            hint={t.settings.privacy.allowRequestsHint}
            checked={privacy?.allow_friend_requests ?? true}
            disabled={!privacy || saving !== null}
            onChange={(v) => void updatePrivacy("allow_friend_requests", v)}
          />
          <PrivacyToggle
            title={t.settings.privacy.appearOnline}
            hint={t.settings.privacy.appearOnlineHint}
            checked={privacy?.appear_online ?? true}
            disabled={!privacy || saving !== null}
            onChange={(v) => void updatePrivacy("appear_online", v)}
          />
          <PrivacyToggle
            title={t.settings.privacy.discordPresence}
            hint={t.settings.privacy.discordPresenceHint}
            checked={privacy?.discord_presence ?? true}
            disabled={!privacy || saving !== null}
            onChange={(v) => void updatePrivacy("discord_presence", v)}
          />
        </div>
      </section>
    </div>
  );
}
