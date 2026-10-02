"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ListMusic,
  MoreHorizontal,
  Share2,
  Flag,
  Disc,
  User,
  Play,
  Trash2,
  Save,
  Sparkles,
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
import { useJam } from "@/lib/jam-store";
import { useToasts } from "@/lib/toast-store";
import { toggleLike } from "@/lib/library";
import { smartPlayNext, toastQueueResult } from "@/lib/smartAddToQueue";
import { PLATFORM_LABELS, type Track } from "@/lib/types";
import { formatDuration } from "@/components/TrackList";
import { TrackMenu } from "@/components/TrackMenu";
import { Popover, MenuItem, type PopoverAnchor } from "@/components/Popover";
import { ConfirmModal } from "@/components/Modal";
import { PlaylistPicker } from "@/components/PlaylistPicker";
import { createPlaylist, addTracksToPlaylist } from "@/lib/playlists";
import { useT, useLocaleStore } from "@/lib/i18n/locale-store";
import { fmt, plural } from "@/lib/i18n/dictionaries";

function Equalizer() {
  return (
    <div className="flex items-end gap-0.5 h-3">
      <span className="w-[2px] h-3 bg-accent rounded-full animate-pulse" />
      <span
        className="w-[2px] h-2 bg-accent rounded-full animate-pulse"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-[2px] h-3.5 bg-accent rounded-full animate-pulse"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

interface RowInfo {
  track: Track;
  qIndex: number;
  num: number;
}

function RowMenuButton({ onClick }: { onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
  const t = useT();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={t.queuePanel.optionsAria}
      className="rounded p-1 text-ink-muted opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity duration-150 hover:text-white shrink-0"
    >
      <MoreHorizontal size={14} />
    </button>
  );
}

function RemoveButton({ onClick, hidden }: { onClick: () => void; hidden?: boolean }) {
  const t = useT();
  if (hidden) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={t.queuePanel.removeFromQueueAria}
      className="rounded p-1 text-ink-muted opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity duration-150 hover:text-bad shrink-0"
    >
      <X size={14} />
    </button>
  );
}

function RowCover({ track }: { track: Track }) {
  return (
    <div className="w-8 h-8 rounded-[6px] overflow-hidden shrink-0 bg-card">
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-muted">
          ♪
        </div>
      )}
    </div>
  );
}

function RowMeta({ track, isAuto }: { track: Track; isAuto?: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-col min-w-0 flex-1">
      <span className="text-white text-[12px] font-medium truncate group-hover:text-accent transition-colors">
        {track.title}
      </span>
      <span className="text-ink-muted text-[11px] truncate">
        {track.artist} • {track.platform === "direct" ? t.types.fileLabel : PLATFORM_LABELS[track.platform]}
        {isAuto && (
          <span className="ml-1 rounded border border-edge px-1 text-[10px] text-ink-muted">
            AUTO
          </span>
        )}
      </span>
    </div>
  );
}

/** Ligne manuelle : DnD + clic droit + multi-sélection. */
function ManualRow({
  info,
  selected,
  canDrag,
  onRowClick,
  onToggleSelect,
  onMenu,
}: {
  info: RowInfo;
  selected: boolean;
  canDrag: boolean;
  onRowClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const sortable = useSortable({ id: info.track.id, data: { qIndex: info.qIndex } });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const dragProps = canDrag
    ? { ...attributes, ...listeners }
    : {};
  return (
    <div
      ref={setNodeRef}
      {...dragProps}
      onClick={onRowClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e);
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`group flex items-center gap-2 p-1.5 rounded-card transition-colors cursor-pointer ${
        selected ? "bg-accent/15 hover:bg-accent/20" : "hover:bg-card"
      } ${isDragging ? "relative bg-card shadow-lg" : ""}`}
    >
      <span className="text-ink-muted text-[11px] tabular-nums w-4 text-center shrink-0">
        {info.num}
      </span>
      {canDrag && (
        <span className="material-symbols-outlined text-ink-muted text-[15px] opacity-40 group-hover:opacity-100 shrink-0 cursor-grab">
          drag_indicator
        </span>
      )}
      <RowCover track={info.track} />
      <RowMeta track={info.track} />
      <span className="text-ink-muted text-[11px] font-mono shrink-0">
        {formatDuration(info.track.durationMs)}
      </span>
      <RowMenuButton onClick={onMenu} />
      <RemoveButton onClick={() => onToggleSelect()} />
    </div>
  );
}

/** Ligne AUTO : désaturée, actions limitées, pas de DnD. */
function AutoRow({
  info,
  onRowClick,
  onToggleSelect,
  onMenu,
}: {
  info: RowInfo;
  onRowClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onClick={onRowClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e);
      }}
      className="group flex items-center gap-2 p-1.5 rounded-card transition-colors cursor-pointer opacity-70 hover:opacity-100 hover:bg-card"
    >
      <span className="text-ink-muted text-[11px] tabular-nums w-4 text-center shrink-0">
        {info.num}
      </span>
      <RowCover track={info.track} />
      <RowMeta track={info.track} isAuto />
      <span className="text-ink-muted text-[11px] font-mono shrink-0">
        {formatDuration(info.track.durationMs)}
      </span>
      <RowMenuButton onClick={onMenu} />
      <RemoveButton onClick={onToggleSelect} />
    </div>
  );
}

export function QueuePanel() {
  const queue = usePlayer((s) => s.queue);
  const currentIndex = usePlayer((s) => s.currentIndex);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const queueEnded = usePlayer((s) => s.queueEnded);
  const playAt = usePlayer((s) => s.playAt);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const reorderQueue = usePlayer((s) => s.reorderQueue);
  const sendToEnd = usePlayer((s) => s.sendToEnd);
  const clearUpcoming = usePlayer((s) => s.clearUpcoming);
  const promoteAuto = usePlayer((s) => s.promoteAuto);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const setAutoplay = usePlayer((s) => s.setAutoplay);
  const autoplay = usePlayer((s) => s.autoplay);
  const push = useToasts((s) => s.push);
  const router = useRouter();
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);

  const jamRole = useJam((s) => (s.session ? (s.session.isHost ? "host" : "guest") : null));
  const canEdit = jamRole !== "guest";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<
    { track: Track; qIndex: number; isAuto: boolean } | null
  >(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [currentMenuAnchor, setCurrentMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [saveAnchor, setSaveAnchor] = useState<PopoverAnchor | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [bulkAnchor, setBulkAnchor] = useState<PopoverAnchor | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const lastSelectedPos = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const current = queue[currentIndex];
  const canDrag = canEdit && isDesktop;
  const remainingMs = current
    ? Math.max(0, (durationMs || current.durationMs || 0) - positionMs)
    : 0;

  // Sections : B (manuels à venir, priorité) puis C (AUTO).
  const manualRows: RowInfo[] = [];
  const autoRows: RowInfo[] = [];
  queue.slice(currentIndex + 1).forEach((track, i) => {
    const info: RowInfo = { track, qIndex: currentIndex + 1 + i, num: 0 };
    (track.auto ? autoRows : manualRows).push(info);
  });
  manualRows.forEach((r, i) => (r.num = i + 1));
  autoRows.forEach((r, i) => (r.num = i + 1));

  const manualTotal = manualRows.reduce((acc, r) => acc + (r.track.durationMs ?? 0), 0);
  const selectedTracks = [...selected]
    .map((id) => manualRows.find((r) => r.track.id === id)?.track)
    .filter((t): t is Track => Boolean(t));

  function closeMenu() {
    setMenuAnchor(null);
    setMenu(null);
  }

  function handleRowClick(e: React.MouseEvent, info: RowInfo, isAuto: boolean) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      if (isAuto) return;
      handleRowClickSelect(info);
      return;
    }
    lastSelectedPos.current = manualRows.findIndex((r) => r.track.id === info.track.id);
    void playAt(info.qIndex);
  }

  /** Toggle de sélection d'une ligne manuelle (checkbox / Ctrl-clic). */
  function handleRowClickSelect(info: RowInfo) {
    const pos = manualRows.findIndex((r) => r.track.id === info.track.id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(info.track.id)) next.delete(info.track.id);
      else next.add(info.track.id);
      return next;
    });
    lastSelectedPos.current = pos;
  }

  function handleDragEnd(e: DragEndEvent) {
    const from = (e.active.data.current as { qIndex: number } | undefined)?.qIndex;
    const to = (e.over?.data.current as { qIndex: number } | undefined)?.qIndex;
    if (from === undefined || to === undefined || from === to) return;
    reorderQueue(from, to);
    push(t.queuePanel.queueReordered, "info");
  }

  function openMenuTrack(e: React.MouseEvent<HTMLElement>, info: RowInfo, isAuto: boolean) {
    setMenu({ track: info.track, qIndex: info.qIndex, isAuto });
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  }

  function handleRemoveSelected() {
    const qIndices = [...selected]
      .map((id) => manualRows.find((r) => r.track.id === id)?.qIndex)
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => b - a);
    const count = qIndices.length;
    for (const q of qIndices) removeFromQueue(q);
    setSelected(new Set());
    if (count > 0) push(fmt(t.queuePanel.removedCount, { n: count }), "success");
  }

  function handlePlaySelected() {
    const first = manualRows.find((r) => selected.has(r.track.id));
    if (first) void playAt(first.qIndex);
    setSelected(new Set());
  }

  function handleSelectAll() {
    setSelected(new Set(manualRows.map((r) => r.track.id)));
  }

  async function handleSaveAsPlaylist() {
    const name = saveName.trim();
    if (!name || saving) return;
    setSaving(true);
    const row = await createPlaylist(name);
    if (!row) {
      setSaving(false);
      push(t.common.createImpossible, "error");
      return;
    }
    const ok = await addTracksToPlaylist(
      row.id,
      manualRows.map((r) => r.track)
    );
    setSaving(false);
    if (!ok) {
      push(t.queuePanel.saveImpossible, "error");
      return;
    }
    setSaveAnchor(null);
    push(fmt(t.queuePanel.queueSaved, { name: row.name }), "success");
    router.refresh();
    router.push(`/playlist/${row.id}`);
  }

  function onKeyDownPanel(e: React.KeyboardEvent) {
    if (e.key === "Delete" && selected.size > 0) {
      e.preventDefault();
      handleRemoveSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      handleSelectAll();
    } else if (e.key === "Escape") {
      setQueueOpen(false);
    }
  }

  return (
    <aside
      tabIndex={0}
      onKeyDown={onKeyDownPanel}
      className="fixed inset-x-0 lg:left-[220px] bottom-[90px] z-[60] flex flex-col gap-3 rounded-t-2xl rounded-b-2xl border border-edge bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[70vh] xl:static xl:inset-auto xl:z-auto xl:rounded-card xl:border xl:pb-4 xl:shadow-none xl:w-[300px] xl:shrink-0 xl:h-fit xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-212px)] focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {/* Drag handle (mobile) */}
      <button
        onClick={() => setQueueOpen(false)}
        aria-label={t.queuePanel.closeQueueAria}
        className="mx-auto h-1.5 w-10 rounded-full bg-edge xl:hidden shrink-0"
      />

      <div className="flex items-center justify-between pb-3 border-b border-edge shrink-0">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-accent" />
          <h2 className="font-display text-[15px] font-semibold text-white">
            {t.queuePanel.queueTitle}
          </h2>
          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-[6px] bg-card text-ink-muted border border-edge">
            {queue.length}
          </span>
        </div>
        <button
          onClick={() => setQueueOpen(false)}
          className="text-[11px] text-ink-muted hover:text-bad transition-colors font-medium hidden xl:block"
        >
          {t.common.close}
        </button>
      </div>

      {/* A — En cours de lecture */}
      {current ? (
        <div className="space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {t.queuePanel.nowPlaying}
            </span>
            {isPlaying && !queueEnded && <Equalizer />}
          </div>
          <div className="p-2.5 rounded-card bg-card border border-edge flex items-center gap-2.5">
            <div className="relative w-11 h-11 rounded-[6px] overflow-hidden shrink-0 bg-panel">
              {current.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.coverUrl}
                  alt=""
                  className={`w-full h-full object-cover ${queueEnded ? "grayscale opacity-50" : ""}`}
                />
              ) : (
                <div className={`flex h-full w-full items-center justify-center text-ink-muted ${queueEnded ? "opacity-50" : ""}`}>
                  ♪
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-white text-[13px] font-semibold truncate">
                {queueEnded ? t.queuePanel.queueEndedTitle : current.title}
              </span>
              <span className="text-ink-muted text-[12px] truncate">
                {queueEnded ? t.queuePanel.queueEndedArtist : current.artist}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-accent font-semibold uppercase">
                  {current.platform === "direct" ? t.types.fileLabel : PLATFORM_LABELS[current.platform]}
                </span>
                <span className="text-ink-muted text-[11px] font-mono">
                  {fmt(t.queuePanel.remaining, { duration: formatDuration(remainingMs) })}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setCurrentMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
              }}
              aria-label={t.queuePanel.currentOptionsAria}
              className="rounded p-1 text-ink-muted hover:text-white transition-colors shrink-0"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-ink-muted py-2 shrink-0">
          {queueEnded
            ? t.queuePanel.queueDone
            : t.queuePanel.queueEmptyHint}
        </p>
      )}

      {/* B — À suivre (file manuelle) */}
      <div className="space-y-2 min-h-0 overflow-y-auto pr-0.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {t.queuePanel.upNext}
            </span>
            {manualRows.length > 0 && (
              <span className="text-[11px] text-ink-muted font-mono truncate">
                {fmt(t.queuePanel.countDuration, { n: manualRows.length, s: plural(manualRows.length), duration: formatDuration(manualTotal) })}
              </span>
            )}
          </div>
          {canEdit && manualRows.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => void playAt(manualRows[0].qIndex)}
                title={t.queuePanel.playNowTitle}
                aria-label={t.queuePanel.playNowTitle}
                className="rounded p-1 text-ink-soft hover:bg-hover hover:text-white transition-colors"
              >
                <Play size={13} fill="currentColor" />
              </button>
              <button
                onClick={() => {
                  if (manualRows.length > 5) setClearOpen(true);
                  else {
                    clearUpcoming();
                    push(t.queuePanel.queueEmptied, "info");
                  }
                }}
                title={t.queuePanel.clearQueueTitle}
                aria-label={t.queuePanel.clearQueueTitle}
                className="rounded p-1 text-ink-soft hover:bg-hover hover:text-bad transition-colors"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={(e) => {
                  setSaveName(
                    fmt(t.queuePanel.defaultSaveName, { date: new Date().toLocaleDateString(locale === "en" ? "en-US" : "fr-FR") })
                  );
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSaveAnchor({ x: rect.left, y: rect.bottom + 4 });
                }}
                title={t.queuePanel.saveAsPlaylistTitle}
                aria-label={t.queuePanel.saveAsPlaylistTitle}
                className="rounded p-1 text-ink-soft hover:bg-hover hover:text-accent transition-colors"
              >
                <Save size={13} />
              </button>
            </div>
          )}
        </div>

        {manualRows.length === 0 ? (
          <p className="text-[12px] text-ink-muted py-1.5">
            {canEdit
              ? t.queuePanel.queueEmptySave
              : t.queuePanel.queueEmptyShared}
          </p>
        ) : canDrag ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={manualRows.map((r) => r.track.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {manualRows.map((info) => (
                  <ManualRow
                    key={info.track.id}
                    info={info}
                    selected={selected.has(info.track.id)}
                    canDrag={canDrag}
                    onRowClick={(e) => handleRowClick(e, info, false)}
                    onToggleSelect={() => handleRowClickSelect(info)}
                    onMenu={(e) => openMenuTrack(e, info, false)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="space-y-1">
            {manualRows.map((info) => (
              <ManualRow
                key={info.track.id}
                info={info}
                selected={selected.has(info.track.id)}
                canDrag={false}
                onRowClick={(e) => handleRowClick(e, info, false)}
                onToggleSelect={() => handleRowClickSelect(info)}
                onMenu={(e) => openMenuTrack(e, info, false)}
              />
            ))}
          </div>
        )}
      </div>

      {/* C — Suggestions automatiques */}
      {(autoplay || autoRows.length > 0) && (
        <div className="flex flex-col gap-2 min-h-0 pt-3 border-t border-edge">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles size={13} className="text-accent shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                {t.queuePanel.autoSuggestions}
              </span>
            </div>
            {!jamRole && (
              <button
                role="switch"
                aria-checked={autoplay}
                onClick={() => {
                  setAutoplay(!autoplay);
                  push(
                    !autoplay
                      ? t.queuePanel.radioOn
                      : t.queuePanel.suggestionsCleared,
                    "info"
                  );
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors p-0.5 focus:outline-none ${
                  autoplay ? "bg-accent" : "bg-edge"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-150 ease-in-out ${
                    autoplay ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            )}
          </div>
          {autoRows.length === 0 ? (
            <p className="text-[12px] text-ink-muted py-1">
              {autoplay
                ? t.queuePanel.suggestionsHint
                : t.queuePanel.radioOff}
            </p>
          ) : (
            <div className="space-y-1 min-h-0 overflow-y-auto pr-0.5">
              {autoRows.map((info) => (
                <AutoRow
                  key={info.track.id}
                  info={info}
                  onRowClick={(e) => handleRowClick(e, info, true)}
                  onToggleSelect={() => removeFromQueue(info.qIndex)}
                  onMenu={(e) => openMenuTrack(e, info, true)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barre de sélection flottante */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 flex items-center gap-1.5 rounded-card border border-edge bg-card px-2.5 py-2 shadow-lg animate-rise-in shrink-0">
          <span className="text-[11px] text-ink-soft shrink-0">
            {selected.size}
          </span>
          <button
            onClick={handlePlaySelected}
            title={t.queuePanel.playSelectionTitle}
            aria-label={t.queuePanel.playSelectionTitle}
            className="rounded p-1.5 text-ink-soft hover:bg-hover hover:text-white transition-colors"
          >
            <Play size={13} fill="currentColor" />
          </button>
          {canEdit && (
            <button
              onClick={handleRemoveSelected}
              title={t.queuePanel.removeSelectionTitle}
              aria-label={t.queuePanel.removeSelectionTitle}
              className="rounded p-1.5 text-bad hover:bg-bad/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setBulkAnchor({ x: rect.left, y: rect.bottom + 4 });
            }}
            title={t.queuePanel.addSelectionToPlaylistTitle}
            aria-label={t.queuePanel.addSelectionToPlaylistTitle}
            className="rounded p-1.5 text-ink-soft hover:bg-hover hover:text-white transition-colors"
          >
            <Save size={13} />
          </button>
          <span className="flex-1" />
          <button
            onClick={() => setSelected(new Set())}
            aria-label={t.queuePanel.clearSelectionAria}
            className="rounded p-1.5 text-ink-muted hover:bg-hover hover:text-white transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Menus */}
      <Popover anchor={menuAnchor} onClose={closeMenu}>
        {menu && (
          <TrackMenu
            track={menu.track}
            anchor={menuAnchor}
            onClose={closeMenu}
            actions={{
              onPlay: () => void playAt(menu.qIndex),
              playLabel: t.queuePanel.playThisNow,
              onPlayNext: () =>
                void smartPlayNext(menu.track).then((r) =>
                  toastQueueResult(push, r, menu.track.title)
                ),
              onSendToEnd: canEdit ? () => sendToEnd(menu.qIndex) : undefined,
              onLike: () =>
                void toggleLike(menu.track).then((ok) =>
                  push(
                    ok === false ? t.common.likeImpossible : ok ? t.common.likeAdded : t.common.likeRemoved,
                    ok === false ? "error" : "success"
                  )
                ),
              onPromote: menu.isAuto && canEdit ? () => promoteAuto(menu.qIndex) : undefined,
              onRemove: menu.isAuto || canEdit ? () => removeFromQueue(menu.qIndex) : undefined,
              removeLabel: menu.isAuto ? t.queuePanel.removeSuggestion : t.queuePanel.removeFromQueue,
              showPlaylists: !menu.isAuto,
            }}
          />
        )}
      </Popover>

      {/* Menu du morceau en cours */}
      <Popover anchor={currentMenuAnchor} onClose={() => setCurrentMenuAnchor(null)}>
        {current && (
          <>
            <MenuItem
              icon={<Disc size={14} />}
              onClick={() => {
                setCurrentMenuAnchor(null);
                push(
                  current.album
                    ? fmt(t.queuePanel.albumSoon, { album: current.album })
                    : t.queuePanel.albumPageSoon,
                  "info"
                );
              }}
            >
              {t.queuePanel.goToAlbum}
            </MenuItem>
            <MenuItem
              icon={<User size={14} />}
              onClick={() => {
                setCurrentMenuAnchor(null);
                push(t.queuePanel.artistPageSoon, "info");
              }}
            >
              {t.queuePanel.toArtist}
            </MenuItem>
            <MenuItem
              icon={<Share2 size={14} />}
              onClick={() => {
                setCurrentMenuAnchor(null);
                void navigator.clipboard
                  .writeText(current.sourceUrl)
                  .then(() => push(t.common.linkCopied, "success"))
                  .catch(() => push(t.common.copyFailed, "error"));
              }}
            >
              {t.queuePanel.shareTrack}
            </MenuItem>
            <MenuItem
              icon={<Flag size={14} />}
              onClick={() => {
                setCurrentMenuAnchor(null);
                push(t.queuePanel.reportOk, "info");
              }}
            >
              {t.queuePanel.report}
            </MenuItem>
          </>
        )}
      </Popover>

      {/* Sauvegarde de la file en playlist */}
      <Popover anchor={saveAnchor} onClose={() => setSaveAnchor(null)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSaveAsPlaylist();
          }}
          className="p-3 space-y-2.5 w-64"
        >
          <p className="text-[13px] font-semibold text-white">
            {t.queuePanel.saveAsPlaylist}
          </p>
          <p className="text-[11px] text-ink-muted">
            {fmt(t.queuePanel.countDuration, { n: manualRows.length, s: plural(manualRows.length), duration: formatDuration(manualTotal) })}
          </p>
          <input
            autoFocus={!!saveAnchor}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            maxLength={80}
            className="w-full rounded-card border border-edge bg-base px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!saveName.trim() || saving || manualRows.length === 0}
            className="w-full rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold py-2 transition-colors disabled:opacity-60"
          >
            {saving ? "..." : t.common.save}
          </button>
        </form>
      </Popover>

      {/* Sélection → playlist (bulk) */}
      <Popover anchor={bulkAnchor} onClose={() => setBulkAnchor(null)}>
        <PlaylistPicker
          bulkTracks={selectedTracks}
          onDone={() => {
            setBulkAnchor(null);
            setSelected(new Set());
          }}
        />
      </Popover>

      <ConfirmModal
        open={clearOpen}
        title={fmt(t.queuePanel.clearConfirmTitle, { n: manualRows.length })}
        description={t.queuePanel.clearConfirmDesc}
        confirmLabel={t.queuePanel.clearConfirm}
        onConfirm={() => {
          clearUpcoming();
          setClearOpen(false);
          push(t.queuePanel.queueEmptied, "info");
        }}
        onClose={() => setClearOpen(false)}
      />
    </aside>
  );
}