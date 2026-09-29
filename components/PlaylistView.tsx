"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heart,
  ListMusic,
  MoreHorizontal,
  Play,
  Play as PlayIcon,
  Shuffle,
  Trash2,
  Search,
  Pencil,
  Copy,
  ListPlus,
  Share2,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePlayer } from "@/lib/player/engine";
import { smartAddToQueue, smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { useToasts } from "@/lib/toast-store";
import { PLATFORM_LABELS } from "@/lib/types";
import { formatDuration } from "@/components/TrackList";
import { Popover, MenuItem, type PopoverAnchor } from "@/components/Popover";
import { TrackMenu } from "@/components/TrackMenu";
import { PlaylistSuggestions } from "@/components/PlaylistSuggestions";
import { SharePlaylistPanel } from "@/components/SharePlaylistPanel";
import { ConfirmModal } from "@/components/Modal";
import {
  updatePlaylist,
  duplicatePlaylist,
  deletePlaylist,
  removeTracksFromPlaylist,
  reorderPlaylist,
  type PlaylistTrackRow,
  type PlaylistDetail,
} from "@/lib/playlists";

type PlaylistInitial = PlaylistDetail & { ownerId: string };

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function PlaylistRowInner({
  row,
  index,
  isCurrent,
  selected,
  onToggleSelect,
  onMenu,
}: {
  row: PlaylistTrackRow;
  index: number;
  isCurrent: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const { track } = row;

  return (
    <>
      <span className="w-6 text-center text-[13px] tabular-nums text-ink-muted shrink-0">
        {isCurrent ? (
          <Play size={13} className="mx-auto text-accent" fill="currentColor" />
        ) : (
          index + 1
        )}
      </span>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-card">
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted">
            <ListMusic size={16} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[14px] font-medium transition-colors group-hover:text-accent ${
            isCurrent ? "text-accent" : "text-ink"
          }`}
        >
          {track.title}
        </p>
        <p className="truncate text-[12px] text-ink-soft">{track.artist}</p>
      </div>
      <span className="hidden sm:inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-panel text-ink-muted border border-edge shrink-0">
        {PLATFORM_LABELS[track.platform]}
      </span>
      <span className="text-ink-muted text-[12px] font-mono shrink-0 w-10 text-right">
        {formatDuration(track.durationMs)}
      </span>
      <span className="hidden lg:block text-ink-muted text-[12px] shrink-0 w-16 text-right">
        {formatDate(row.addedAt)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        aria-label={`Sélectionner ${track.title}`}
        className={`shrink-0 rounded p-1 transition-colors ${
          selected ? "text-accent" : "text-ink-muted opacity-0 group-hover:opacity-100 hover:text-white"
        }`}
      >
        <span className="block h-3.5 w-3.5 rounded-[4px] border border-current" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMenu(e);
        }}
        aria-label={`Options de ${track.title}`}
        className="shrink-0 rounded p-1 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-white transition"
      >
        <MoreHorizontal size={15} />
      </button>
    </>
  );
}

function SortablePlaylistRow(props: {
  row: PlaylistTrackRow;
  index: number;
  isCurrent: boolean;
  selected: boolean;
  onRowClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.row.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={props.onRowClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`group flex items-center gap-3 px-2 py-2 rounded-card transition-colors cursor-pointer ${
        props.selected ? "bg-accent/15 hover:bg-accent/20" : "hover:bg-hover"
      } ${isDragging ? "relative bg-card shadow-lg" : ""}`}
    >
      <PlaylistRowInner {...props} />
    </div>
  );
}

function StaticPlaylistRow(props: {
  row: PlaylistTrackRow;
  index: number;
  isCurrent: boolean;
  selected: boolean;
  onRowClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onClick={props.onRowClick}
      className={`group flex items-center gap-3 px-2 py-2 rounded-card transition-colors cursor-pointer ${
        props.selected ? "bg-accent/15 hover:bg-accent/20" : "hover:bg-hover"
      }`}
    >
      <PlaylistRowInner {...props} />
    </div>
  );
}

export function PlaylistView({
  initial,
  share,
}: {
  initial: PlaylistInitial;
  share?: {
    creatorName?: string;
    saving: boolean;
    onSaveCopy: () => void;
    onListen: () => void;
  };
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const playTrack = usePlayer((s) => s.playTrack);
  const currentTrack = usePlayer((s) => s.currentTrack());

  const [tracks, setTracks] = useState(initial.tracks);
  const [titleValue, setTitleValue] = useState(initial.name);
  const [descValue, setDescValue] = useState(initial.description);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prevInitial, setPrevInitial] = useState(initial);
  // Resync depuis le serveur après router.refresh() (ajustement pendant
  // le rendu — pattern React recommandé, pas d'effet).
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setTracks(initial.tracks);
    setTitleValue(initial.name);
    setDescValue(initial.description);
    setSelected(new Set());
    setEditingTitle(false);
    setEditingDesc(false);
  }
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [pageMenuAnchor, setPageMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [shareAnchor, setShareAnchor] = useState<PopoverAnchor | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastSelectedIndex = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.size]);

  const allTracks = tracks.map((t) => t.track);
  const totalMs = allTracks.reduce((acc, t) => acc + (t.durationMs ?? 0), 0);
  const cover = tracks[0]?.track.coverUrl ?? initial.coverUrl;
  const menuRow = tracks.find((t) => t.id === menuRowId) ?? null;

  async function handlePlayAll(shuffled = false) {
    if (!allTracks.length) return;
    const list = shuffled ? [...allTracks].sort(() => Math.random() - 0.5) : allTracks;
    await playTrack(list[0], list);
    push(`Lecture : ${initial.name}`, "success");
  }

  async function handleAddAllToQueue() {
    for (const t of allTracks) {
      const result = await smartAddToQueue(t);
      if (result === "failed") {
        push("Ajout impossible", "error");
        return;
      }
    }
    usePlayer.getState().setQueueOpen(true);
    push(`${allTracks.length} titres ajoutés à la file ✓`, "success");
  }

  function handleRowClick(e: React.MouseEvent, row: PlaylistTrackRow, index: number) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSelectId(row.id, index);
      return;
    }
    if (e.shiftKey && lastSelectedIndex.current !== null) {
      e.preventDefault();
      const [a, b] = [lastSelectedIndex.current, index].sort((x, y) => x - y);
      setSelected(new Set(tracks.slice(a, b + 1).map((t) => t.id)));
      return;
    }
    lastSelectedIndex.current = index;
    void playTrack(row.track, allTracks);
  }

  function toggleSelectId(id: string, index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastSelectedIndex.current = index;
  }

  async function handleRemoveSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const snapshot = tracks;
    setTracks((prev) => prev.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
    const ok = await removeTracksFromPlaylist(ids);
    if (!ok) {
      setTracks(snapshot);
      push("Suppression impossible", "error");
      return;
    }
    push(`${ids.length} titre(s) retiré(s) ✓`, "success");
    router.refresh();
  }

  async function handleAddSelectedToQueue() {
    const rows = tracks.filter((t) => selected.has(t.id));
    for (const r of rows) {
      const result = await smartAddToQueue(r.track);
      if (result === "failed") {
        push("Ajout impossible", "error");
        return;
      }
    }
    usePlayer.getState().setQueueOpen(true);
    push(`${rows.length} titre(s) ajouté(s) à la file ✓`, "success");
    setSelected(new Set());
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = tracks.findIndex((t) => t.id === active.id);
    const to = tracks.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;
    const snapshot = tracks;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setTracks(next);
    void reorderPlaylist(initial.id, next.map((t) => t.id)).then((ok) => {
      if (!ok) {
        setTracks(snapshot);
        push("Réorganisation impossible", "error");
        return;
      }
      router.refresh();
    });
  }

  function openRowMenu(e: React.MouseEvent<HTMLElement>, rowId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuRowId(rowId);
    setMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  }

  async function handleRenameTitle() {
    const name = titleValue.trim();
    setEditingTitle(false);
    if (!name || name === initial.name) {
      setTitleValue(initial.name);
      return;
    }
    const ok = await updatePlaylist(initial.id, { name });
    if (!ok) {
      setTitleValue(initial.name);
      push("Renommage impossible", "error");
      return;
    }
    push("Playlist renommée ✓", "success");
    router.refresh();
  }

  async function handleRenameDesc() {
    setEditingDesc(false);
    if (descValue === initial.description) return;
    const ok = await updatePlaylist(initial.id, { description: descValue });
    if (!ok) {
      setDescValue(initial.description);
      push("Modification impossible", "error");
      return;
    }
    push("Description mise à jour ✓", "success");
    router.refresh();
  }

  async function handleDuplicate() {
    setPageMenuAnchor(null);
    const row = await duplicatePlaylist(initial.id);
    if (!row) {
      push("Duplication impossible", "error");
      return;
    }
    push("Playlist dupliquée ✓", "success");
    router.refresh();
    router.push(`/playlist/${row.id}`);
  }

  async function handleDeletePlaylist() {
    setDeleting(true);
    const ok = await deletePlaylist(initial.id);
    setDeleting(false);
    if (!ok) {
      push("Suppression impossible", "error");
      return;
    }
    setDeleteOpen(false);
    push(`Playlist « ${initial.name} » supprimée`, "success");
    router.push("/");
    router.refresh();
  }

  function focusSearch() {
    const el = document.getElementById("resonance-url-input");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLInputElement | null)?.focus({ preventScroll: true });
  }

  return (
    <div className="pt-2 max-w-4xl">
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="w-40 h-40 shrink-0 rounded-card bg-card border border-edge overflow-hidden flex items-center justify-center">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-hover text-ink-muted text-5xl">
              ♪
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0 justify-end gap-1.5 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Playlist
            </span>
            {share && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-accent/15 border border-accent text-accent">
                Playlist publique
              </span>
            )}
          </div>
          {editingTitle && initial.isOwner ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={() => void handleRenameTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameTitle();
                if (e.key === "Escape") {
                  setTitleValue(initial.name);
                  setEditingTitle(false);
                }
              }}
              maxLength={80}
              className="font-display text-[26px] font-bold text-white leading-tight bg-transparent border-b border-accent outline-none w-full"
            />
          ) : (
            <h1
              onClick={() => initial.isOwner && setEditingTitle(true)}
              title={initial.isOwner ? "Cliquer pour renommer" : undefined}
              className={`font-display text-[26px] font-bold text-white leading-tight break-words ${
                initial.isOwner ? "cursor-text hover:underline decoration-edge underline-offset-4" : ""
              }`}
            >
              {initial.name}
            </h1>
          )}
          {editingDesc && initial.isOwner ? (
            <input
              autoFocus
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={() => void handleRenameDesc()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameDesc();
                if (e.key === "Escape") {
                  setDescValue(initial.description);
                  setEditingDesc(false);
                }
              }}
              maxLength={200}
              placeholder="Ajouter une description…"
              className="text-[13px] text-ink-soft bg-transparent border-b border-accent outline-none w-full"
            />
          ) : (
            <p
              onClick={() => initial.isOwner && setEditingDesc(true)}
              className={`text-[13px] text-ink-soft truncate ${
                initial.isOwner ? "cursor-text hover:underline decoration-edge underline-offset-4" : ""
              }`}
            >
              {initial.description || (initial.isOwner ? "Ajouter une description…" : "")}
            </p>
          )}
          <p className="text-[12px] text-ink-muted">
            {tracks.length} titre{tracks.length > 1 ? "s" : ""}
            {totalMs > 0 && ` · ${formatDuration(totalMs)}`}
            {share?.creatorName && ` · par ${share.creatorName}`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2.5">
        <button
          onClick={() => void handlePlayAll(false)}
          disabled={!tracks.length}
          className="px-5 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <PlayIcon size={16} fill="currentColor" />
          <span>Lecture</span>
        </button>
        <button
          onClick={() => void handlePlayAll(true)}
          disabled={!tracks.length}
          title="Lecture aléatoire"
          className="w-10 h-10 rounded-full border border-edge bg-panel hover:bg-hover text-ink-soft hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
        >
          <Shuffle size={17} />
        </button>
        {initial.isOwner ? (
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPageMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
            }}
            aria-label="Options de la playlist"
            className="w-10 h-10 rounded-full border border-edge bg-panel hover:bg-hover text-ink-soft hover:text-white flex items-center justify-center transition-colors"
          >
            <MoreHorizontal size={17} />
          </button>
        ) : share ? (
          <>
            <button
              onClick={() => share.onListen()}
              disabled={!tracks.length}
              className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <PlayIcon size={15} fill="currentColor" />
              <span>Écouter</span>
            </button>
            <button
              onClick={() => share.onSaveCopy()}
              disabled={share.saving || !tracks.length}
              className="px-3.5 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Heart size={15} />
              <span>{share.saving ? "..." : "Enregistrer dans mes playlists"}</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => void handleAddAllToQueue()}
            disabled={!tracks.length}
            className="px-3.5 py-2 rounded-card bg-panel hover:bg-hover border border-edge text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <ListPlus size={15} />
            <span>Ajouter tout à ma file</span>
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-card border border-edge bg-card px-3 py-2 animate-rise-in">
          <span className="text-[12px] text-ink-soft">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <span className="flex-1" />
          <button
            onClick={() => void handleAddSelectedToQueue()}
            className="px-2.5 py-1.5 rounded-card text-[12px] text-ink-soft hover:bg-hover hover:text-white transition-colors"
          >
            Ajouter à la file
          </button>
          {initial.isOwner && (
            <button
              onClick={() => void handleRemoveSelected()}
              className="px-2.5 py-1.5 rounded-card text-[12px] text-bad hover:bg-bad/10 transition-colors"
            >
              Supprimer
            </button>
          )}
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Effacer la sélection"
            className="rounded p-1.5 text-ink-muted hover:bg-hover hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mt-4">
        {tracks.length === 0 ? (
          <div className="rounded-card border border-edge bg-card px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-hover text-ink-muted text-2xl">
              ♪
            </div>
            <p className="text-[14px] font-semibold text-white">Cette playlist est vide</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              Colle un lien ou cherche un titre pour commencer.
            </p>
            <button
              onClick={focusSearch}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold transition-colors"
            >
              <Search size={14} />
              Rechercher un titre
            </button>
          </div>
        ) : initial.isOwner ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden px-1 py-1">
                {tracks.map((row, i) => (
                  <SortablePlaylistRow
                    key={row.id}
                    row={row}
                    index={i}
                    isCurrent={currentTrack?.id === row.track.id}
                    selected={selected.has(row.id)}
                    onRowClick={(e) => handleRowClick(e, row, i)}
                    onToggleSelect={() => toggleSelectId(row.id, i)}
                    onMenu={(e) => openRowMenu(e, row.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="rounded-card bg-card border border-edge divide-y divide-edge overflow-hidden px-1 py-1">
            {tracks.map((row, i) => (
              <StaticPlaylistRow
                key={row.id}
                row={row}
                index={i}
                isCurrent={currentTrack?.id === row.track.id}
                selected={selected.has(row.id)}
                onRowClick={(e) => handleRowClick(e, row, i)}
                onToggleSelect={() => toggleSelectId(row.id, i)}
                onMenu={(e) => openRowMenu(e, row.id)}
              />
            ))}
          </div>
        )}
      </div>

      <PlaylistSuggestions
        playlistId={initial.id}
        playlistTracks={allTracks}
        isOwner={initial.isOwner}
      />

      {menuRow && (
        <TrackMenu
          track={menuRow.track}
          anchor={menuAnchor}
          onClose={() => {
            setMenuAnchor(null);
            setMenuRowId(null);
          }}
          actions={{
            onPlay: () => void playTrack(menuRow.track, allTracks),
            playLabel: "Écouter",
            onPlayNext: () =>
              void smartPlayNext(menuRow.track).then((result) =>
                toastQueueResult(push, result, menuRow.track.title)
              ),
            onAddToQueue: () => {
              void smartAddToQueue(menuRow.track).then((result) => {
                usePlayer.getState().setQueueOpen(true);
                toastQueueResult(push, result, menuRow.track.title);
              });
            },
            ...(initial.isOwner
              ? {
                  onRemove: () => {
                    const id = menuRow.id;
                    const snapshot = tracks;
                    setTracks((prev) => prev.filter((t) => t.id !== id));
                    void removeTracksFromPlaylist([id]).then((ok) => {
                      if (!ok) {
                        setTracks(snapshot);
                        push("Suppression impossible", "error");
                        return;
                      }
                      push("Retiré de la playlist ✓", "success");
                      router.refresh();
                    });
                  },
                  removeLabel: "Supprimer de la playlist",
                }
              : {}),
          }}
        />
      )}

      <Popover anchor={pageMenuAnchor} onClose={() => setPageMenuAnchor(null)}>
        <MenuItem
          icon={<Pencil size={14} />}
          onClick={() => {
            setPageMenuAnchor(null);
            setEditingTitle(true);
          }}
        >
          Renommer
        </MenuItem>
        <MenuItem
          icon={<Copy size={14} />}
          onClick={() => void handleDuplicate()}
        >
          Dupliquer
        </MenuItem>
        <MenuItem
          icon={<Share2 size={14} />}
          onClick={() => {
            setShareAnchor(pageMenuAnchor);
            setPageMenuAnchor(null);
          }}
        >
          Partager
        </MenuItem>
        <MenuItem
          icon={<Trash2 size={14} />}
          danger
          onClick={() => {
            setPageMenuAnchor(null);
            setDeleteOpen(true);
          }}
        >
          Supprimer
        </MenuItem>
      </Popover>

      <Popover anchor={shareAnchor} onClose={() => setShareAnchor(null)}>
        <SharePlaylistPanel
          playlistId={initial.id}
          initialIsPublic={initial.isPublic}
          initialToken={initial.shareToken}
        />
      </Popover>

      <ConfirmModal
        open={deleteOpen}
        title={`Supprimer définitivement « ${initial.name} » ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={() => void handleDeletePlaylist()}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
      />
    </div>
  );
}
