"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/locale-store";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup") {
      router.replace("/login?created=1");
      return;
    }

    router.replace("/");
    router.refresh();
  }

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

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
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
