"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { avatarFileError, uploadAvatar } from "@/lib/avatars";
import { isDisplayNameTaken, isDisplayNameTakenError, syncOwnProfileEmail } from "@/lib/friends";
import { useT } from "@/lib/i18n/locale-store";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Unicité du nom (migration 013) : false = libre, true = pris,
  // null = RPC indisponible (on laisse le serveur trancher au submit).
  const [nameTaken, setNameTaken] = useState<boolean | null>(null);

  // Vérification débouncée (~400ms) de la disponibilité du nom en signup.
  // (Pas de setState synchrone ici : le hint ne s'affiche que si le champ
  // est non vide, et une saisie en cours annule le timer précédent.)
  useEffect(() => {
    if (mode !== "signup") return;
    const name = displayName.trim();
    if (!name) return;
    const id = setTimeout(() => {
      void isDisplayNameTaken(name).then((taken) => setNameTaken(taken));
    }, 400);
    return () => clearTimeout(id);
  }, [displayName, mode]);

  const showCreatedBanner =
    mode === "login" && !bannerDismissed && searchParams.get("created") === "1";
  const showConfirmedBanner =
    mode === "login" && !bannerDismissed && searchParams.get("confirmed") === "1";

  function handleAvatarPick(file: File | undefined) {
    if (!file) return;
    const kind = avatarFileError(file);
    if (kind === "too_big") {
      setError(t.auth.avatarTooBig);
      return;
    }
    if (kind === "bad_type") {
      setError(t.auth.avatarBadType);
      return;
    }
    setError(null);
    setAvatarFile(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Nom présent mais déjà pris → on bloque (le RPC a pu renvoyer null :
    // dans ce cas on laisse passer, la 23505 sera mappée juste après).
    if (mode === "signup") {
      const name = displayName.trim();
      if (name && nameTaken === true) {
        setLoading(false);
        setError(t.auth.displayNameTaken);
        return;
      }
    }
    setLoading(true);

    const supabase = createClient();

    if (mode === "login") {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);
      if (authError) {
        setError(authError.message);
        return;
      }
      // Persiste l'email dans profiles (fallback d'affichage, migration 009).
      void syncOwnProfileEmail();
      router.replace("/");
      router.refresh();
      return;
    }

    // Signup: display_name via user metadata (trigger copies it into profiles,
    // falling back to the email prefix server-side when empty).
    const name = displayName.trim();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: name ? { display_name: name } : {},
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    });

    if (authError) {
      setLoading(false);
      // Doublon de nom (index unique profiles_display_name_key) → message
      // amical sur le champ, pas l'erreur brute de Supabase/Postgres.
      if (isDisplayNameTakenError(authError)) {
        setNameTaken(true);
        setError(t.auth.displayNameTaken);
        return;
      }
      setError(authError.message);
      return;
    }

    // Confirm-email OFF → session active : on uploade l'avatar aussitôt.
    if (data.session && data.user) {
      if (avatarFile) {
        try {
          const url = await uploadAvatar(avatarFile, data.user.id);
          await supabase.from("profiles").update({ avatar_url: url }).eq("id", data.user.id);
        } catch {
          setLoading(false);
          setError(t.auth.avatarUploadFailed);
          router.replace("/");
          router.refresh();
          return;
        }
      }
      setLoading(false);
      // Le trigger signup remplit déjà display_name + email ; on ré-écrit
      // l'email par sécurité (upsert idempotent, une seule écriture).
      void syncOwnProfileEmail();
      router.replace("/");
      router.refresh();
      return;
    }

    // Confirm-email ON → pas de session : l'avatar sera ajouté plus tard
    // dans Paramètres (le bandeau login le rappelle brièvement).
    setLoading(false);
    router.replace("/login?created=1");
  }

  const previewInitial = (displayName.trim() || email || "?").charAt(0).toUpperCase();

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-lg bg-panel p-8 shadow-lg animate-rise-in"
    >
      <h1 className="text-center text-2xl font-semibold text-ink">
        {mode === "login" ? t.auth.welcomeBack : t.auth.createAccount}
      </h1>
      <p className="mt-1 text-center text-sm text-ink-soft">
        {mode === "login" ? t.auth.welcomeBackSub : t.auth.signupSub}
      </p>

      {(showCreatedBanner || showConfirmedBanner) && (
        <div className="mt-4 flex items-start gap-2 rounded-card bg-ok/10 px-3 py-2 text-sm text-ok">
          <p className="min-w-0 flex-1">
            {showConfirmedBanner ? t.auth.confirmedCanLogin : t.auth.createdCheckEmail}
          </p>
          <button
            type="button"
            aria-label="×"
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 text-ok/70 hover:text-ok"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      )}

      {mode === "signup" && (
        <>
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {t.auth.displayName}
            <input
              type="text"
              maxLength={40}
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t.auth.displayNamePlaceholder}
              aria-invalid={nameTaken === true}
              className="mt-2 w-full rounded-card border border-edge bg-base px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none transition-colors duration-150 focus:border-accent placeholder:text-ink-muted"
            />
            {nameTaken === true && displayName.trim() && (
              <p className="mt-1 text-[12px] text-bad">{t.auth.displayNameTaken}</p>
            )}
          </label>

          <div className="mt-4">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {t.auth.avatar}
            </span>
            <div className="mt-2 flex items-center gap-3">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover border border-edge"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[15px] font-semibold text-white uppercase">
                  {previewInitial}
                </span>
              )}
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-card border border-edge bg-base px-3 py-1.5 text-[13px] text-ink-soft hover:text-white transition-colors"
                >
                  {t.auth.avatarChange}
                </button>
                <p className="mt-1 text-[11px] text-ink-muted">{t.auth.avatarHint}</p>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarPick(e.target.files?.[0])}
            />
          </div>
        </>
      )}

      <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {t.auth.email}
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-card border border-edge bg-base px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none transition-colors duration-150 focus:border-accent"
        />
      </label>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {t.auth.password}
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-card border border-edge bg-base px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none transition-colors duration-150 focus:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-card bg-accent py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "..."
          : mode === "login"
            ? t.auth.loginAction
            : t.auth.signupAction}
      </button>

      <p className="mt-4 text-center text-sm text-ink-soft">
        {mode === "login" ? (
          <>
            {t.auth.noAccount}{" "}
            <Link href="/signup" className="text-accent hover:underline">
              {t.auth.signupAction}
            </Link>
          </>
        ) : (
          <>
            {t.auth.hasAccount}{" "}
            <Link href="/login" className="text-accent hover:underline">
              {t.auth.loginAction}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
