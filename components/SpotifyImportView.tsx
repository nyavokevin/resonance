"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  Music2,
} from "lucide-react";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import { createPlaylist, addTracksToPlaylist } from "@/lib/playlists";
import type { Track } from "@/lib/types";
import { PLATFORM_COLORS } from "@/lib/types";

type ItemStatus = "pending" | "resolving" | "youtube" | "spotify" | "failed";

interface ImportItem {
  spotifyId: string;
  title: string;
  artists: string;
  album: string;
  coverUrl?: string;
  durationMs?: number;
  isrc?: string;
  status: ItemStatus;
  track?: Track;
}

interface EnumerateResponse {
  title: string;
  coverUrl?: string;
  items: Array<{
    spotifyId: string;
    title: string;
    artists: string;
    album: string;
    coverUrl?: string;
    durationMs?: number;
    isrc?: string;
    isPlayable: boolean;
  }>;
}

async function resolveOne(
  item: ImportItem
): Promise<{ status: ItemStatus; track?: Track }> {
  try {
    const res = await fetch("/api/resolve-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "spotify",
        trackId: item.spotifyId,
        isrc: item.isrc,
        title: item.title,
        artist: item.artists,
        durationMs: item.durationMs,
        album: item.album,
        coverUrl: item.coverUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.track) throw new Error();
    return {
      status: data.source === "youtube" ? "youtube" : "spotify",
      track: data.track as Track,
    };
  } catch {
    return { status: "failed" };
  }
}

function StatusBadge({ status }: { status: ItemStatus }) {
  if (status === "youtube") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ok">
        <Check size={13} />
        YouTube
      </span>
    );
  }
  if (status === "spotify") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-warn">
        <Music2 size={13} />
        Spotify
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-bad">
        <AlertTriangle size={13} />
        Introuvable
      </span>
    );
  }
  if (status === "resolving") {
    return <Loader2 size={13} className="shrink-0 animate-spin text-accent" />;
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-edge" />;
}

export function SpotifyImportView({
  collectionId,
  kind,
  title,
  coverUrl,
  artist,
  trackCount,
}: {
  collectionId: string;
  kind: "album" | "playlist";
  title: string;
  coverUrl?: string;
  artist?: string;
  trackCount?: number;
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const [phase, setPhase] = useState<"loading" | "resolving" | "done" | "error">(
    "loading"
  );
  const [error, setError] = useState("");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [excludeMissing, setExcludeMissing] = useState(true);
  const [importing, setImporting] = useState(false);
  const [listening, setListening] = useState(false);
  const [nonce, setNonce] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    const myRun = ++runId.current;
    const alive = () => runId.current === myRun;
    void (async () => {
      let enumerated: EnumerateResponse;
      try {
        const res = await fetch(
          `/api/spotify-enumerate?kind=${kind}&id=${encodeURIComponent(collectionId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        enumerated = data as EnumerateResponse;
      } catch {
        if (!alive()) return;
        setError("Collection Spotify introuvable.");
        setPhase("error");
        return;
      }
      if (!alive()) return;
      setItems(
        enumerated.items.map((item) => ({ ...item, status: "pending" as const }))
      );
      setPhase("resolving");

      const list = enumerated.items;
      for (let i = 0; i < list.length; i += 5) {
        if (!alive()) return;
        const batch = list.slice(i, i + 5);
        setItems((prev) =>
          prev.map((it, idx) =>
            idx >= i && idx < i + 5 && it.status === "pending"
              ? { ...it, status: "resolving" as const }
              : it
          )
        );
        const results = await Promise.all(
          batch.map((item) =>
            resolveOne({
              spotifyId: item.spotifyId,
              title: item.title,
              artists: item.artists,
              album: item.album,
              coverUrl: item.coverUrl,
              durationMs: item.durationMs,
              isrc: item.isrc,
              status: "pending",
            })
          )
        );
        if (!alive()) return;
        setItems((prev) =>
          prev.map((it, idx) => {
            const k = idx - i;
            if (k < 0 || k >= results.length) return it;
            const r = results[k];
            return r.track
              ? { ...it, status: r.status, track: r.track }
              : { ...it, status: r.status };
          })
        );
      }
      if (!alive()) return;
      setPhase("done");
    })();
  }, [collectionId, kind, nonce]);

  const done = items.filter(
    (it) => it.status === "youtube" || it.status === "spotify" || it.status === "failed"
  ).length;
  const failed = items.filter((it) => it.status === "failed");
  // Les échecs ont toujours status failed sans track : inclus <=> résolus.
  const includedTracks = items.filter(
    (it) => it.track && (!excludeMissing || it.status !== "failed")
  );

  /** Récapitulatif de résolution : "12/12 ✓" ou "11/12 (1 introuvable ⚠)". */
  function recapToast(verb: string) {
    const total = items.length;
    const okCount = includedTracks.length;
    const missing = total - okCount;
    const label = `${kind === "album" ? "Album" : "Playlist"} « ${title} » ${verb} — ${okCount}/${total} titre${total > 1 ? "s" : ""} résolu${okCount > 1 ? "s" : ""}`;
    push(
      missing > 0
        ? `${label} (${missing} introuvable${missing > 1 ? "s" : ""} ⚠)`
        : `${label} ✓`,
      missing > 0 ? "info" : "success"
    );
  }

  async function handleImport() {
    const tracks = includedTracks.map((it) => it.track!);
    if (!tracks.length || importing) return;
    setImporting(true);
    try {
      const row = await createPlaylist(title);
      if (!row) throw new Error();
      const ok = await addTracksToPlaylist(row.id, tracks);
      if (!ok) throw new Error();
      recapToast("importée");
      router.refresh();
      router.push(`/playlist/${row.id}`);
    } catch {
      push("Import impossible.", "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleListen() {
    const tracks = includedTracks.map((it) => it.track!);
    if (!tracks.length || listening) return;
    setListening(true);
    for (const t of tracks) {
      const r = await smartAddToQueue(t);
      if (r === "failed") {
        push("Ajout impossible.", "error");
        break;
      }
    }
    usePlayer.getState().setQueueOpen(true);
    recapToast("ajoutée");
    setListening(false);
  }

  if (phase === "error") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-card border border-edge bg-card p-8 text-center">
        <AlertTriangle size={28} className="mx-auto text-bad" />
        <h1 className="mt-3 text-[16px] font-semibold text-white">{error}</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          Vérifie le lien ou réessaie dans un moment.
        </p>
        <button
          onClick={() => {
            setPhase("loading");
            setItems([]);
            setNonce((n) => n + 1);
          }}
          className="mt-5 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold px-4 py-2 transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-4">
        <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-card bg-card border border-edge">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 size={28} className="text-ink-muted" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {kind === "album" ? "Album" : "Playlist"} · Import
            </p>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
              style={{ background: PLATFORM_COLORS.spotify }}
            >
              Spotify
            </span>
          </div>
          <h1 className="mt-1 truncate font-display text-[22px] font-bold text-white">
            {title}
          </h1>
          {artist && (
            <p className="truncate text-[13px] text-ink-soft">{artist}</p>
          )}
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {items.length > 0
              ? `${items.length} piste${items.length > 1 ? "s" : ""} détectée${items.length > 1 ? "s" : ""}`
              : trackCount
                ? `${trackCount} pistes annoncées · détection…`
                : "Détection des pistes…"}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[12px] text-ink-soft">
            <span>
              Résolution {done}/{items.length}
            </span>
            <span className="tabular-nums">
              {Math.round((done / items.length) * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => void handleImport()}
          disabled={phase !== "done" || includedTracks.length === 0 || importing}
          className="rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold px-4 py-2 transition-colors disabled:opacity-50"
        >
          {importing ? "Import…" : "Importer comme playlist"}
        </button>
        <button
          onClick={() => void handleListen()}
          disabled={phase !== "done" || includedTracks.length === 0 || listening}
          className="rounded-card border border-edge bg-panel hover:bg-hover text-white text-[12px] font-medium px-4 py-2 transition-colors disabled:opacity-50"
        >
          {listening ? "Ajout…" : "Écouter"}
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
          <button
            role="switch"
            aria-checked={excludeMissing}
            onClick={() => setExcludeMissing((v) => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors p-0.5 focus:outline-none ${
              excludeMissing ? "bg-accent" : "bg-edge"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-150 ease-in-out ${
                excludeMissing ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          Exclure les introuvables
        </label>
      </div>

      {failed.length > 0 && (
        <p className="mt-2 text-[12px] text-warn">
          {failed.length} titre{failed.length > 1 ? "s" : ""} introuvable
          {failed.length > 1 ? "s" : ""}
          {excludeMissing ? " (exclus)" : ""}.
        </p>
      )}

      <ul className="mt-4 overflow-hidden rounded-card border border-edge bg-card divide-y divide-edge">
        {items.map((it, i) => (
          <li
            key={`${it.spotifyId}-${i}`}
            className="flex items-center gap-3 px-3 py-2"
          >
            <span className="w-6 shrink-0 text-center text-[12px] tabular-nums text-ink-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">
                {it.track?.title ?? it.title}
              </p>
              <p className="truncate text-[12px] text-ink-soft">
                {it.track?.artist ?? it.artists}
              </p>
            </div>
            <StatusBadge status={it.status} />
          </li>
        ))}
        {phase === "loading" && (
          <li className="px-3 py-6 text-center text-[13px] text-ink-muted">
            Détection des pistes…
          </li>
        )}
      </ul>
    </div>
  );
}
