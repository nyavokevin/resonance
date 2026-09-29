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

export function JamView() {
  const session = useJam((s) => s.session);
  const participants = useJam((s) => s.participants);
  const setSession = useJam((s) => s.setSession);
  const setParticipants = useJam((s) => s.setParticipants);
  const push = useToasts((s) => s.push);
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
      push(error ?? "Impossible de créer la session", "error");
      return;
    }
    setParticipants([{ id: userId, name: "Toi (host)" }]);
    setSession({ id: row.id, code: row.code, isHost: true });
    push(`Session Jam créée — code ${row.code}`, "success");
  }

  async function handleJoin() {
    if (loading || codeInput.trim().length < 4) {
      push("Entre le code à 6 caractères", "error");
      return;
    }
    setLoading(true);
    const row = await findJamSessionByCode(codeInput);
    if (!row) {
      setLoading(false);
      push("Session introuvable", "error");
      return;
    }
    const isHost = row.host_id === userId;
    if (!isHost && userId) await joinJamSession(row.id, userId);
    const state = await fetchJamState(row.id);
    setSession({ id: row.id, code: row.code, isHost });
    setLoading(false);
    if (state && state.queue.length > 0) {
      await usePlayer.getState().applyJamState(state);
      push("Synchronisé avec la session Jam", "success");
    } else {
      push(`Session ${row.code} rejointe`, "success");
    }
  }

  async function handleLeave() {
    if (!session) return;
    if (session.isHost) {
      await deleteJamSession(session.id);
      push("Session Jam terminée", "info");
    } else {
      if (userId) await leaveJamSession(session.id, userId);
      push("Tu as quitté la session", "info");
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
              Jam — Écoute ensemble
            </h1>
          </div>
          <p className="text-[13px] text-ink-soft">
            Crée une session, partage le code, et tout le monde écoute la même
            musique synchronisée. Le host contrôle la lecture et la file.
          </p>
        </div>

        <div className="rounded-card bg-card border border-edge p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3">
            Créer une session
          </h2>
          <button
            onClick={() => void handleCreate()}
            disabled={loading}
            className="px-4 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            <Play size={15} fill="currentColor" />
            <span>Lancer une session Jam</span>
          </button>
        </div>

        <div className="rounded-card bg-card border border-edge p-5">
          <h2 className="text-[13px] font-semibold text-white mb-3">
            Rejoindre avec un code
          </h2>
          <div className="flex items-center gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="AB12CD"
              className="w-40 h-9 rounded-card border border-edge bg-base px-3 text-[14px] font-mono font-semibold tracking-widest text-white uppercase placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={() => void handleJoin()}
              disabled={loading}
              className="px-4 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium transition-colors disabled:opacity-60"
            >
              Rejoindre
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
              {session.isHost ? "Tu contrôles la session" : "Synchronisé"}
            </p>
            <h1 className="font-display text-[20px] font-bold text-white flex items-center gap-3">
              <Radio size={20} className="text-accent" />
              Session {session.code}
            </h1>
          </div>
          <button
            onClick={() => void handleLeave()}
            className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-bad text-[12px] font-medium flex items-center gap-1.5 transition-colors"
          >
            <LogOut size={15} />
            <span>{session.isHost ? "Terminer" : "Quitter"}</span>
          </button>
        </div>
        {session.isHost && (
          <p className="mt-3 text-[12px] text-ink-soft">
            Partage ce code avec tes amis :{" "}
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
            Participants
            <span className="ml-2 text-ink-muted">({participants.length})</span>
          </h2>
        </div>
        {participants.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            En attente des participants…
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
                      Écoute en ce moment : {p.track.title} — {p.track.artist}
                    </span>
                  )}
                </div>
                <span
                  className="ml-auto w-1.5 h-1.5 shrink-0 rounded-full bg-ok"
                  title="Connecté"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12px] text-ink-muted">
        {session.isHost
          ? "Ta lecture est diffusée à tous les participants en temps réel."
          : "Le host diffuse en direct — mets en pause à tout moment, puis reprends le live via « Go Live »."}
      </p>
    </div>
  );
}

export default function JamPage() {
  return <JamView />;
}
