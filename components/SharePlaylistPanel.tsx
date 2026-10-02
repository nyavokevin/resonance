"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import {
  togglePlaylistPublic,
  regenerateShareToken,
  fetchPlaylistDetail,
} from "@/lib/playlists";
import { useT } from "@/lib/i18n/locale-store";

/** Panneau "Partager" : toggle public, lien, copier/ouvrir/régénérer. */
export function SharePlaylistPanel({
  playlistId,
  initialIsPublic,
  initialToken,
}: {
  playlistId: string;
  initialIsPublic: boolean;
  initialToken: string | null;
}) {
  const push = useToasts((s) => s.push);
  const t = useT();
  const [isOn, setIsOn] = useState(initialIsPublic);
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const link =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/playlist/share/${token}`
      : "";

  async function refresh() {
    const detail = await fetchPlaylistDetail(playlistId);
    if (detail) {
      setIsOn(detail.isPublic);
      setToken(detail.shareToken);
    }
  }

  async function handleToggle() {
    if (busy) return;
    setBusy(true);
    const ok = await togglePlaylistPublic(playlistId, !isOn);
    if (ok) {
      await refresh();
      push(!isOn ? t.share.madePublic : t.share.madePrivate, "success");
    } else {
      push(t.common.operationImpossible, "error");
    }
    setBusy(false);
  }

  async function handleRegenerate() {
    if (busy) return;
    setBusy(true);
    const next = await regenerateShareToken(playlistId);
    setBusy(false);
    if (!next) {
      push(t.common.operationImpossible, "error");
      return;
    }
    setToken(next);
    push(t.share.newLink, "success");
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      push(t.common.linkCopied, "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push(t.common.copyFailed, "error");
    }
  }

  return (
    <div className="w-72 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-white">{t.share.makePublic}</span>
          <span className="text-[11px] text-ink-muted">
            {t.share.accessibleViaLink}
          </span>
        </div>
        <button
          role="switch"
          aria-checked={isOn}
          onClick={() => void handleToggle()}
          disabled={busy}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors p-0.5 focus:outline-none disabled:opacity-60 ${
            isOn ? "bg-accent" : "bg-edge"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-150 ease-in-out ${
              isOn ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {isOn && (
        <>
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              aria-label={t.share.shareLinkAria}
              className="min-w-0 flex-1 rounded-card border border-edge bg-base px-2 py-1.5 text-[11px] font-mono text-ink-soft outline-none"
            />
            <button
              onClick={() => void handleCopy()}
              aria-label={t.share.copyLinkAria}
              title={t.share.copyLinkAria}
              className="shrink-0 rounded-card bg-accent hover:bg-accent-hover text-white p-1.5 transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              onClick={() => window.open(link, "_blank", "noopener")}
              aria-label={t.share.openLinkAria}
              title={t.share.openLinkAria}
              className="shrink-0 rounded-card border border-edge bg-base hover:bg-hover text-ink-soft hover:text-white p-1.5 transition-colors"
            >
              <ExternalLink size={14} />
            </button>
          </div>
          <button
            onClick={() => void handleRegenerate()}
            disabled={busy}
            className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-bad transition-colors disabled:opacity-60"
          >
            <RefreshCw size={13} />
            {t.share.regenerate}
          </button>
        </>
      )}
    </div>
  );
}
