"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, RefreshCw, ShieldCheck, User } from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import { useLocaleStore, useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";
import { createClient } from "@/lib/supabase/client";
import { avatarFileError, uploadAvatar } from "@/lib/avatars";
import { isDisplayNameTakenError } from "@/lib/friends";
import { untrackPresence } from "@/lib/presence";
import type { ProfilePrivacy } from "@/lib/social";

type PrivacyKey = keyof ProfilePrivacy;

/** Toggle auto-update persisté (défaut ON), lu sans setState en effet. */
function readAutoUpdatePref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("resonance:auto-update") !== "0";
  } catch {
    return true;
  }
}

/** Valeur ne changeant jamais après le chargement — subscription no-op. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** Electron packaged (window.resonance?.update) visible côté client uniquement. */
function getElectronUpdateSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.resonance?.update;
}

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
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const push = useToasts((s) => s.push);

  const [userId, setUserId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<ProfilePrivacy | null>(null);
  const [saving, setSaving] = useState<PrivacyKey | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Mise à jour (Electron packaged uniquement — window.resonance?.update).
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState<boolean>(readAutoUpdatePref);
  // useSyncExternalStore : pas de mismatch d'hydration (false côté serveur,
  // vraie valeur côté client, sans setState synchrone dans un effet).
  const isElectronUpdate = useSyncExternalStore(
    subscribeToNothing,
    getElectronUpdateSnapshot,
    () => false
  );

  // Montage (Electron only) : version courante + toggle persisté + écoute
  // des statuts (unsubscribe au démontage pour ne pas empiler).
  useEffect(() => {
    const up = window.resonance?.update;
    if (!up) return;
    void up.getAppVersion().then(setAppVersion).catch(() => {});
    up.setAutoDownload(autoUpdate);
    return up.onUpdateStatus((status) => {
      if (status.event === "checking") setUpdateChecking(true);
      else setUpdateChecking(false);
      setUpdateStatus(status);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUpdateCheck() {
    if (updateChecking) return;
    setUpdateChecking(true);
    setUpdateStatus(null);
    window.resonance?.update?.checkForUpdates(true);
  }

  function handleAutoUpdateChange(on: boolean) {
    setAutoUpdate(on);
    try {
      localStorage.setItem("resonance:auto-update", on ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.resonance?.update?.setAutoDownload(on);
  }

  /** Texte d'erreur du check : les codes machine → message localisé. */
  function updateErrorText(status: Extract<UpdateStatus, { event: "error" }>): string {
    if (status.code === "dev-not-available") return t.settings.update.devOnly;
    if (status.code === "timeout") return t.settings.update.timeout;
    return `${t.settings.update.error}${status.message ? ` — ${status.message}` : ""}`;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled || !auth.user?.id) return;
      setUserId(auth.user.id);
      const { data } = await supabase
        .from("profiles")
        .select("share_listening_activity, allow_friend_requests, appear_online, discord_presence, display_name, avatar_url")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = (data ?? {}) as Partial<ProfilePrivacy> & {
        display_name?: string | null;
        avatar_url?: string | null;
      };
      setPrivacy({
        share_listening_activity: row.share_listening_activity ?? true,
        allow_friend_requests: row.allow_friend_requests ?? true,
        appear_online: row.appear_online ?? true,
        discord_presence: row.discord_presence ?? true,
      });
      setDisplayName(row.display_name ?? "");
      setAvatarUrl(row.avatar_url ?? null);
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

  async function handleAvatarChange(file: File | undefined) {
    if (!file || !userId || avatarUploading) return;
    const kind = avatarFileError(file);
    if (kind === "too_big") {
      push(t.settings.profile.avatarTooBig, "error");
      return;
    }
    if (kind === "bad_type") {
      push(t.settings.profile.avatarBadType, "error");
      return;
    }
    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(file, userId);
      const { error } = await createClient()
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", userId);
      if (error) {
        push(t.settings.profile.avatarUploadFailed, "error");
        return;
      }
      setAvatarUrl(url);
      push(t.settings.profile.saved, "success");
      // TopBar reads avatarUrl from the server layout : revalidate it
      // or the header keeps showing the initial until a full reload.
      router.refresh();
    } catch {
      push(t.settings.profile.avatarUploadFailed, "error");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleProfileSave() {
    if (!userId || profileSaving) return;
    setProfileSaving(true);
    try {
      const { error } = await createClient()
        .from("profiles")
        .update({ display_name: displayName.trim() || null })
        .eq("id", userId);
      if (error) {
        // Nom déjà pris (index unique 013) → erreur amicale, pas le
        // message brut de Postgres.
        if (isDisplayNameTakenError(error)) {
          push(t.auth.displayNameTaken, "error");
          return;
        }
        push(t.common.operationImpossible, "error");
        return;
      }
      push(t.settings.profile.saved, "success");
      // Same revalidation : TopBar displays displayName from the layout.
      router.refresh();
    } finally {
      setProfileSaving(false);
    }
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
            <User size={17} />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-white">
              {t.settings.profile.title}
            </h2>
            <p className="text-[12px] text-ink-muted">
              {t.settings.profile.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full object-cover border border-edge"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[16px] font-semibold text-white uppercase">
              {(displayName.trim() || "?").charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <button
              type="button"
              disabled={!userId || avatarUploading}
              onClick={() => avatarInputRef.current?.click()}
              className="rounded-card border border-edge bg-card hover:bg-hover px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:text-white transition-colors disabled:opacity-60"
            >
              {avatarUploading ? "…" : t.settings.profile.avatarChange}
            </button>
            <p className="mt-1 text-[11px] text-ink-muted">{t.settings.profile.avatarHint}</p>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleAvatarChange(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {t.settings.profile.displayName}
            <input
              type="text"
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t.settings.profile.displayNamePlaceholder}
              className="mt-2 w-full rounded-card border border-edge bg-card px-3 py-2 text-sm font-normal normal-case tracking-normal text-white outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={!userId || profileSaving}
            onClick={() => void handleProfileSave()}
            className="shrink-0 rounded-card bg-accent hover:bg-accent-hover px-4 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
          >
            {profileSaving ? t.settings.profile.saving : t.settings.profile.save}
          </button>
        </div>
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

      {isElectronUpdate && (
        <section className="rounded-card border border-edge bg-panel p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-card bg-accent/15 text-accent">
              <RefreshCw size={17} />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-white">
                {t.settings.update.title}
              </h2>
              <p className="text-[12px] text-ink-muted">
                {appVersion
                  ? fmt(t.settings.update.currentVersion, { version: appVersion })
                  : "…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleUpdateCheck}
              disabled={updateChecking}
              className="flex shrink-0 items-center gap-1.5 rounded-card bg-accent hover:bg-accent-hover px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors disabled:opacity-60"
            >
              {updateChecking ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <RefreshCw size={13} />
              )}
              <span>
                {updateChecking
                  ? t.settings.update.checking
                  : t.settings.update.check}
              </span>
            </button>
            {updateStatus && (
              <span
                className={`text-[12px] ${
                  updateStatus.event === "error"
                    ? "text-bad"
                    : updateStatus.event === "none"
                      ? "text-ok"
                      : "text-accent"
                }`}
              >
                {updateStatus.event === "available" || updateStatus.event === "progress"
                  ? fmt(t.settings.update.downloading, {
                      percent: String(
                        updateStatus.event === "progress"
                          ? updateStatus.percent
                          : 0
                      ),
                    })
                  : updateStatus.event === "downloaded"
                    ? t.settings.update.downloaded
                    : updateStatus.event === "none"
                      ? t.settings.update.upToDate
                      : updateStatus.event === "error"
                        ? updateErrorText(updateStatus)
                        : null}
              </span>
            )}
          </div>

          <button
            role="switch"
            aria-checked={autoUpdate}
            onClick={() => handleAutoUpdateChange(!autoUpdate)}
            className="flex w-full items-center gap-3 rounded-card border border-edge bg-card hover:bg-hover p-3 text-left transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-white">
                {t.settings.update.autoUpdate}
              </span>
              <span className="block text-[12px] text-ink-muted">
                {t.settings.update.autoUpdateHint}
              </span>
            </span>
            <span
              aria-hidden
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                autoUpdate ? "bg-accent" : "bg-base border border-edge"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  autoUpdate ? "left-[18px]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </section>
      )}

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
