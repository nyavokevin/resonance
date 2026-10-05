"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Play, Radio, UserPlus, Users } from "lucide-react";
import { useJam } from "@/lib/jam-store";
import { Popover, type PopoverAnchor } from "@/components/Popover";
import { FriendPicker } from "@/components/FriendPicker";
import { anchorFromEvent } from "@/components/TrackMenu";
import { sendJamInvite, startConversation } from "@/lib/dm";
import {
  approveJoinRequest,
  cancelJoinRequest,
  createJamSession,
  declineJoinRequest,
  deleteJamSession,
  fetchJamState,
  fetchParticipants,
  findJamSessionByCode,
  isJoinRequestsSupported,
  joinJamSession,
  leaveJamSession,
  listJoinRequests,
  requestToJoin,
  subscribeJoinRequests,
  type JamJoinRequest,
} from "@/lib/jam";
import { displayNameOf } from "@/lib/friends";
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
  const [inviteAnchor, setInviteAnchor] = useState<PopoverAnchor | null>(null);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  // Demande envoyée, en attente de la décision du host (guest, sans session).
  const [pendingJoin, setPendingJoin] = useState<{ sessionId: string; code: string } | null>(null);
  // Demandes reçues (host uniquement).
  const [joinRequests, setJoinRequests] = useState<JamJoinRequest[]>([]);

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

  // Guest : suit la décision du host sur sa demande (temps réel).
  useEffect(() => {
    if (session || !pendingJoin || !userId) return;
    const { sessionId, code } = pendingJoin;
    const unsubscribe = subscribeJoinRequests(sessionId, (row) => {
      if (!row || row.user_id !== userId) return;
      if (row.status === "accepted") {
        setPendingJoin(null);
        void completeGuestJoin(sessionId, code);
      } else if (row.status === "declined") {
        setPendingJoin(null);
        push(t.jam.requestDeclined, "info");
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pendingJoin, userId, push, t]);

  // Host : liste + suivi temps réel des demandes en attente.
  // (Pas de setState synchrone ici : joinRequests est vidé dans handleLeave
  // et la section ne rend que si session.isHost.)
  useEffect(() => {
    if (!session?.isHost) return;
    let cancelled = false;
    const refresh = () => {
      void listJoinRequests(session.id).then((rows) => {
        if (!cancelled) setJoinRequests(rows);
      });
    };
    refresh();
    const unsubscribe = subscribeJoinRequests(session.id, () => refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session?.id, session?.isHost]);

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

  /** Entrée dans la session après acceptation (guest) — même final que le join direct. */
  async function completeGuestJoin(sessionId: string, code: string) {
    const state = await fetchJamState(sessionId);
    setSession({ id: sessionId, code, isHost: false });
    if (state && state.queue.length > 0) {
      await usePlayer.getState().applyJamState(state);
      push(t.jam.synced, "success");
    } else {
      push(fmt(t.jam.sessionJoined, { code }), "success");
    }
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
    if (isHost) {
      // Reprise de sa propre session : direct, pas de demande.
      const state = await fetchJamState(row.id);
      setSession({ id: row.id, code: row.code, isHost });
      setLoading(false);
      if (state && state.queue.length > 0) {
        await usePlayer.getState().applyJamState(state);
        push(t.jam.synced, "success");
      } else {
        push(fmt(t.jam.sessionJoined, { code: row.code }), "success");
      }
      return;
    }
    if (!userId) {
      setLoading(false);
      push(t.jam.sessionNotFound, "error");
      return;
    }
    // Guest : demande au host au lieu du join instantané.
    const req = await requestToJoin(row.id);
    setLoading(false);
    if (!req) {
      // 010 absente : repli direct legacy pour que le bouton fonctionne
      // toujours (requestToJoin a déjà console.warn). Sinon toast d'erreur.
      if (isJoinRequestsSupported() === false) {
        console.warn(
          "[jam] join requests unavailable — falling back to direct join"
        );
        const ok = await joinJamSession(row.id, userId);
        if (!ok) {
          push(t.jam.sessionNotFound, "error");
          return;
        }
        await completeGuestJoin(row.id, row.code);
        return;
      }
      push(t.jam.sessionNotFound, "error");
      return;
    }
    if (req.status === "accepted") {
      // Déjà accepté auparavant (ex. retour après départ) : direct.
      await completeGuestJoin(row.id, row.code);
      return;
    }
    setPendingJoin({ sessionId: row.id, code: row.code });
    push(t.jam.requestSent, "success");
  }

  async function handleCancelJoin() {
    if (!pendingJoin || !userId) return;
    await cancelJoinRequest(pendingJoin.sessionId, userId);
    setPendingJoin(null);
  }

  async function handleApproveRequest(requestUserId: string, name: string) {
    if (!session) return;
    const ok = await approveJoinRequest(session.id, requestUserId);
    push(
      ok ? fmt(t.jam.requestAccepted, { name }) : t.common.operationImpossible,
      ok ? "success" : "error"
    );
    if (ok) {
      void listJoinRequests(session.id).then(setJoinRequests);
    }
  }

  async function handleDeclineRequest(requestUserId: string) {
    if (!session) return;
    const ok = await declineJoinRequest(session.id, requestUserId);
    if (!ok) {
      push(t.common.operationImpossible, "error");
      return;
    }
    void listJoinRequests(session.id).then(setJoinRequests);
  }

  async function handleInviteConfirm() {
    if (!session || inviting || inviteIds.length === 0) return;
    setInviting(true);
    try {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId ?? "")
        .maybeSingle();
      const hostName =
        (profile as { display_name?: string | null } | null)?.display_name ||
        (locale === "en" ? "Your friend" : "Ton ami");
      let sent = 0;
      for (const fid of inviteIds) {
        const conv = await startConversation(fid);
        if (!conv) continue;
        const res = await sendJamInvite(conv.id, {
          jamId: session.id,
          code: session.code,
          hostName,
        });
        if (res.ok) sent++;
      }
      setInviteAnchor(null);
      setInviteIds([]);
      push(
        sent > 0 ? fmt(t.chat.jamInvited, { n: sent }) : t.common.operationImpossible,
        sent > 0 ? "success" : "error"
      );
    } finally {
      setInviting(false);
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
    setJoinRequests([]);
    setPendingJoin(null);
    router.push("/");
  }

  if (!session) {
    if (pendingJoin) {
      return (
        <div className="max-w-xl space-y-4">
          <div className="rounded-card bg-card border border-edge p-6">
            <div className="flex items-center gap-2.5 mb-1">
              <Radio size={20} className="text-accent" />
              <h1 className="font-display text-[20px] font-bold text-white">
                {fmt(t.jam.sessionCode, { code: pendingJoin.code })}
              </h1>
            </div>
            <p className="text-[13px] text-accent animate-pulse">
              {t.jam.requestPending}
            </p>
            <button
              onClick={() => void handleCancelJoin()}
              className="mt-4 px-4 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-ink-soft hover:text-white text-[12px] font-medium transition-colors"
            >
              {t.jam.cancelRequest}
            </button>
          </div>
        </div>
      );
    }
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
          <button
            onClick={(e) => {
              setInviteIds([]);
              setInviteAnchor(anchorFromEvent(e));
            }}
            className="ml-auto flex items-center gap-1.5 rounded-card border border-edge bg-panel hover:bg-hover px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors"
          >
            <UserPlus size={13} />
            <span>{t.jam.inviteFriends}</span>
          </button>
        </div>
        {session.isHost && joinRequests.length > 0 && (
          <div className="mb-3 border-b border-edge pb-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
              {fmt(t.jam.pendingRequests, { n: joinRequests.length })}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {joinRequests.map((r) => (
                <li
                  key={r.user_id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-card bg-base border border-edge"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover border border-edge text-[12px] font-semibold text-white uppercase">
                    {displayNameOf(r.profile, r.user_id, "JamView:joinRequest").charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white">
                    {displayNameOf(r.profile, r.user_id, "JamView:joinRequest")}
                  </span>
                  <button
                    onClick={() =>
                      void handleApproveRequest(
                        r.user_id,
                        displayNameOf(r.profile, r.user_id, "JamView:joinRequest")
                      )
                    }
                    className="shrink-0 rounded-card bg-accent hover:bg-accent-hover px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors"
                  >
                    {t.jam.accept}
                  </button>
                  <button
                    onClick={() => void handleDeclineRequest(r.user_id)}
                    className="shrink-0 rounded-card border border-edge px-2.5 py-1.5 text-[12px] text-ink-soft hover:text-white transition-colors"
                  >
                    {t.jam.decline}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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

      <Popover anchor={inviteAnchor} onClose={() => setInviteAnchor(null)}>
        <FriendPicker
          mode="multi"
          selectedIds={inviteIds}
          onToggle={(fid) =>
            setInviteIds((prev) =>
              prev.includes(fid) ? prev.filter((id) => id !== fid) : [...prev, fid]
            )
          }
          onConfirm={() => void handleInviteConfirm()}
          confirming={inviting}
        />
      </Popover>
    </div>
  );
}

export default function JamPage() {
  return <JamView />;
}
