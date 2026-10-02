"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ListPlus } from "lucide-react";
import { useToasts } from "@/lib/toast-store";
import type { Track } from "@/lib/types";
import {
  fetchPlaylists,
  createPlaylist,
  addTrackToPlaylist,
  addTracksToPlaylist,
  removeTracksFromPlaylist,
  findTrackInPlaylists,
  type PlaylistSummary,
} from "@/lib/playlists";
import { Skeleton } from "@/components/Skeleton";
import { useT } from "@/lib/i18n/locale-store";
import { fmt, plural } from "@/lib/i18n/dictionaries";

/** Contenu "Ajouter à une playlist" : création inline + liste avec ✓ toggle.
 * bulkTracks : mode multi-sélection — cliquer une playlist ajoute tous les
 * titres (pas de toggle ✓). */
export function PlaylistPicker({
  track,
  bulkTracks,
  onDone,
}: {
  track?: Track;
  bulkTracks?: Track[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const bulk = bulkTracks && bulkTracks.length > 0;
  const [loading, setLoading] = useState(bulk ? false : true);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [present, setPresent] = useState<Map<string, string>>(new Map());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (bulk) return;
    let cancelled = false;
    Promise.all([fetchPlaylists(), findTrackInPlaylists(track!)])
      .then(([lists, map]) => {
        if (cancelled) return;
        setPlaylists(lists);
        setPresent(map);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bulk) return;
    let cancelled = false;
    fetchPlaylists()
      .then((lists) => {
        if (cancelled) return;
        setPlaylists(lists);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bulk]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    const row = await createPlaylist(name);
    if (!row) {
      setCreating(false);
      push(t.common.createImpossible, "error");
      return;
    }
    const ok = bulk
      ? await addTracksToPlaylist(row.id, bulkTracks!)
      : await addTrackToPlaylist(row.id, track!);
    setCreating(false);
    if (!ok) {
      push(t.playlistPicker.notAdded, "error");
      return;
    }
    setNewName("");
    push(
      bulk
        ? fmt(t.playlistPicker.addedCountTo, { n: bulkTracks!.length, name: row.name })
        : fmt(t.playlistPicker.addedTo, { name: row.name }),
      "success"
    );
    router.refresh();
    onDone?.();
  }

  async function handleToggle(p: PlaylistSummary) {
    if (busyId) return;
    setBusyId(p.id);
    if (bulk) {
      const ok = await addTracksToPlaylist(p.id, bulkTracks!);
      setBusyId(null);
      if (ok) {
        push(fmt(t.playlistPicker.addedCountTo, { n: bulkTracks!.length, name: p.name }), "success");
        router.refresh();
        onDone?.();
      } else {
        push(t.common.addImpossible, "error");
      }
      return;
    }
    const existingId = present.get(p.id);
    setBusyId(p.id);
    if (existingId) {
      const ok = await removeTracksFromPlaylist([existingId]);
      if (ok) {
        setPresent((prev) => {
          const next = new Map(prev);
          next.delete(p.id);
          return next;
        });
        push(fmt(t.playlistPicker.removedFrom, { name: p.name }), "success");
      } else {
        push(t.common.operationImpossible, "error");
      }
    } else if (track) {
      const ok = await addTrackToPlaylist(p.id, track);
      if (ok) {
        const map = await findTrackInPlaylists(track);
        setPresent(map);
        push(fmt(t.playlistPicker.addedTo, { name: p.name }), "success");
      } else {
        push(t.common.addImpossible, "error");
      }
    }
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="w-64">
      <form onSubmit={(e) => void handleCreate(e)} className="flex items-center gap-1.5 px-2 py-2 border-b border-edge">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.playlistPicker.newPlaylistPlaceholder}
          maxLength={80}
          aria-label={t.playlistPicker.newPlaylistAria}
          className="min-w-0 flex-1 rounded-card border border-edge bg-base px-2 py-1.5 text-[12px] text-white placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
        />
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          aria-label={t.playlistPicker.createPlaylistAria}
          className="shrink-0 rounded-card bg-accent hover:bg-accent-hover text-white p-1.5 transition-colors disabled:opacity-60"
        >
          <ListPlus size={14} />
        </button>
      </form>
      <div className="max-h-56 overflow-y-auto py-1">
        {loading ? (
          <div className="px-2 py-1 space-y-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : playlists.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-ink-muted">
            {t.playlistPicker.noPlaylists}
          </p>
        ) : (
          playlists.map((p) => {
            const checked = present.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => void handleToggle(p)}
                disabled={busyId === p.id}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors text-ink-soft hover:bg-hover hover:text-white disabled:opacity-60"
              >
                <span className="h-6 w-6 shrink-0 overflow-hidden rounded-[6px] bg-base flex items-center justify-center">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-ink-muted">♪</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{p.name}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {fmt(t.common.titlesCountWithSuffix, { n: p.trackCount, s: plural(p.trackCount) })}
                  </span>
                </span>
                {!bulk && checked && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
