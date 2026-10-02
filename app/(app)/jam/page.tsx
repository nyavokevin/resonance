"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Play, Radio, Users } from "lucide-react";
import { useJam } from "@/lib/jam-store";
import {
  createJamSession,
  deleteJamSession,
  fetchJamState,
  fetchParticipants,
  findJamSessionByCode,
  joinJamSession,
  leaveJamSession,
} from "@/lib/jam";
import { usePlayer } from "@/lib/player/engine";
import { useToasts } from "@/lib/toast-store";
import { createClient } from "@/lib/supabase/client";
import { useT, useLocale } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

export function JamView() {
  const session = useJam((s) => s.session);
  const participants = useJam((s) => s.participants);
  const setSession = useJam((s) => s.setSession);
  const setParticipants = useJam((s) => s.setParticipants);
  const push = useToasts((s) => s.push);
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [codeInput, setCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!session) return;
    void fetchParticipants(session.id)
      .then((p) => {
        if (p.length > 0) useJam.getState().setParticipants(p);
      })
      .catch(() => {});
  }, [session]);

  async function handleCreate() {
    if (!userId || loading) return;
    setLoading(true);
    const { session: row, error } = await createJamSession(userId);
    setLoading(false);
    if (!row) {
      push(error ?? t.jam.createImpossible, "error");
      return;
    }
    setParticipants([{ id: userId, name: locale === "en" ? "You (host)" : "Toi (host)" }]);
    setSession({ id: row.id, code: row.code, isHost: true });
    push(fmt(t.jam.sessionCreated, { code: row.code }), "success");
  }

  async function handleJoin() {
    if (loading || codeInput.trim().length < 4) {
      push(t.jam.enterCode, "error");
      return;
    }
    setLoading(true);
    const row = await findJamSessionByCode(codeInput);
    if (!row) {
      setLoading(false);
      push(t.jam.sessionNotFound, "error");
      return;
    }
    const isHost = row.host_id === userId;
    if (!isHost && userId) await joinJamSession(row.id, userId);
    const state = await fetchJamState(row.id);
    setSession({ id: row.id, code: row.code, isHost });
    setLoading(false);
    if (state && state.queue.length > 0) {
      await usePlayer.getState().applyJamState(state);
      push(t.jam.synced, "success");
    } else {
      push(fmt(t.jam.sessionJoined, { code: row.code }), "success");
    }
  }

  async function handleLeave() {
    if (!session) return;
    if (session.isHost) {
      await deleteJamSession(session.id);
      push(t.jam.sessionEnded, "info");
    } else {
      if (userId) await leaveJamSession(session.id, userId);
      push(t.jam.leftSession, "info");
    }
    setSession(null);
    setParticipants([]);
    router.push("/");
  }

  if (!session) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="rounded-card bg-card border border-edge p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <Radio size={20} className="text-accent" />
            <h1 className="font-display text-[20px] font-bold text-white">
              {t.jam.title}
            </h1>
          </div>
          <p className="text-[13px] text-ink-soft">
            {t.jam.subtitle}
          </p>
        </div>

        <div className="rounded-card bg-card border border-edge p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3">
            {t.jam.createSession}
          </h2>
          <button
            onClick={() => void handleCreate()}
            disabled={loading}
            className="px-4 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            <Play size={15} fill="currentColor" />
            <span>{t.jam.startSession}</span>
          </button>
        </div>

        <div className="rounded-card bg-card border border-edge p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3">
            {t.jam.joinWithCode}
          </h2>
          <div className="flex items-center gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder={t.jam.codePlaceholder}
              className="w-40 h-9 rounded-card border border-edge bg-base px-3 text-[14px] font-mono font-semibold tracking-widest text-white uppercase placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={() => void handleJoin()}
              disabled={loading}
              className="px-4 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium transition-colors disabled:opacity-60"
            >
              {t.jam.join}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-card bg-card border border-edge p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              {session.isHost ? t.jam.youControl : t.jam.syncedLabel}
            </p>
            <h1 className="font-display text-[20px] font-bold text-white flex items-center gap-3">
              <Radio size={20} className="text-accent" />
              {fmt(t.jam.sessionCode, { code: session.code })}
            </h1>
          </div>
          <button
            onClick={() => void handleLeave()}
            className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-bad text-[12px] font-medium flex items-center gap-1.5 transition-colors"
          >
            <LogOut size={15} />
            <span>{session.isHost ? t.jam.end : t.jam.leave}</span>
          </button>
        </div>
        {session.isHost && (
          <p className="mt-3 text-[12px] text-ink-soft">
            {t.jam.shareCode}{" "}
            <span className="font-mono font-bold text-white text-[14px] tracking-widest">
              {session.code}
            </span>
          </p>
        )}
      </div>

      <div className="rounded-card bg-card border border-edge p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-accent" />
          <h2 className="text-[13px] font-semibold text-white">
            {fmt(t.jam.participants, { n: participants.length })}
          </h2>
        </div>
        {participants.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            {t.jam.waiting}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {participants.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-card hover:bg-hover"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[12px] font-semibold text-white uppercase">
                  {p.name.charAt(0)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] text-ink-soft">{p.name}</span>
                  {p.track && (
                    <span className="truncate text-[11px] text-accent">
                      {fmt(t.jam.nowPlaying, { title: p.track.title, artist: p.track.artist })}
                    </span>
                  )}
                </div>
                <span
                  className="ml-auto w-1.5 h-1.5 shrink-0 rounded-full bg-ok"
                  title={t.jam.connected}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12px] text-ink-muted">
        {session.isHost ? t.jam.hostHint : t.jam.guestHint}
      </p>
    </div>
  );
}

export default function JamPage() {
  return <JamView />;
}
