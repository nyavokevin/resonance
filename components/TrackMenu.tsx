"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Heart,
  ListMusic,
  ListPlus,
  Play,
  Share2,
  Trash2,
} from "lucide-react";
import type { Track } from "@/lib/types";
import { Popover, MenuItem, MenuLabel, type PopoverAnchor } from "@/components/Popover";
import { PlaylistPicker } from "@/components/PlaylistPicker";

export interface TrackMenuActions {
  onPlay?: () => void;
  playLabel?: string;
  onPlayNext?: () => void;
  onAddToQueue?: () => void;
  onSendToEnd?: () => void;
  onLike?: () => void;
  onShare?: () => void;
  onPromote?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  /** false → masque le sous-menu "Ajouter à la playlist" (lignes AUTO). */
  showPlaylists?: boolean;
}

/**
 * Menu "..." / clic droit partagé : actions + sous-menu
 * "Ajouter à la playlist". Utilisé par toutes les surfaces de l'app.
 */
export function TrackMenu({
  track,
  anchor,
  onClose,
  actions,
}: {
  track: Track;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  actions: TrackMenuActions;
}) {
  const [view, setView] = useState<"main" | "playlists">("main");
  const [prevAnchor, setPrevAnchor] = useState(anchor);
  // Reset à la vue principale à chaque réouverture (pattern render-time).
  if (prevAnchor !== anchor) {
    setPrevAnchor(anchor);
    setView("main");
  }
  if (!anchor) return null;

  const showPlaylists = actions.showPlaylists !== false;
  const hasMain = Boolean(
    actions.onPlay ||
      actions.onPlayNext ||
      actions.onAddToQueue ||
      actions.onSendToEnd ||
      actions.onLike ||
      actions.onShare ||
      actions.onPromote ||
      actions.onRemove ||
      showPlaylists
  );

  return (
    <Popover anchor={anchor} onClose={onClose}>
      {view === "playlists" || !hasMain ? (
        <>
          {hasMain && (
            <button
              onClick={() => setView("main")}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-ink-muted hover:text-white transition-colors border-b border-edge"
            >
              <ChevronLeft size={14} />
              Retour
            </button>
          )}
          <PlaylistPicker
            track={track}
            onDone={() => {
              setView("main");
              onClose();
            }}
          />
        </>
      ) : (
        <>
          <MenuLabel>{track.title}</MenuLabel>
          {actions.onPlay && (
            <MenuItem icon={<Play size={14} />} onClick={() => { onClose(); actions.onPlay!(); }}>
              {actions.playLabel ?? "Écouter"}
            </MenuItem>
          )}
          {actions.onPlayNext && (
            <MenuItem icon={<ArrowUp size={14} />} onClick={() => { onClose(); actions.onPlayNext!(); }}>
              Lire ensuite
            </MenuItem>
          )}
          {actions.onAddToQueue && (
            <MenuItem icon={<ListPlus size={14} />} onClick={() => { onClose(); actions.onAddToQueue!(); }}>
              Ajouter à la file
            </MenuItem>
          )}
          {actions.onSendToEnd && (
            <MenuItem icon={<ArrowDown size={14} />} onClick={() => { onClose(); actions.onSendToEnd!(); }}>
              Envoyer à la fin
            </MenuItem>
          )}
          {actions.onLike && (
            <MenuItem icon={<Heart size={14} />} onClick={() => { onClose(); actions.onLike!(); }}>
              Aimer ce titre
            </MenuItem>
          )}
          {actions.onShare && (
            <MenuItem icon={<Share2 size={14} />} onClick={() => { onClose(); actions.onShare!(); }}>
              Partager
            </MenuItem>
          )}
          {showPlaylists && (
            <MenuItem icon={<ListMusic size={14} />} onClick={() => setView("playlists")}>
              <span className="flex-1">Ajouter à la playlist</span>
              <ChevronRight size={14} className="text-ink-muted" />
            </MenuItem>
          )}
          {actions.onPromote && (
            <MenuItem icon={<ListPlus size={14} />} onClick={() => { onClose(); actions.onPromote!(); }}>
              Ajouter à la file manuelle
            </MenuItem>
          )}
          {actions.onRemove && (
            <MenuItem
              icon={<Trash2 size={14} />}
              danger
              onClick={() => { onClose(); actions.onRemove!(); }}
            >
              {actions.removeLabel ?? "Supprimer"}
            </MenuItem>
          )}
        </>
      )}
    </Popover>
  );
}

/** Ancre un Popover sous l'élément cliqué. */
export function anchorFromEvent(e: React.MouseEvent<HTMLElement>): PopoverAnchor {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
}