"use client";

import { useEffect, useState } from "react";
import {
  Heart,
  Home,
  Search,
  Sparkles,
  Album,
  User,
  Folder,
  ListMusic,
  ListPlus,
  Play,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useToasts } from "@/lib/toast-store";
import { usePlayer } from "@/lib/player/engine";
import type { PlaylistSummaryServer } from "@/lib/library-server";
import {
  createPlaylist,
  updatePlaylist,
  duplicatePlaylist,
  deletePlaylist,
  fetchPlaylistDetail,
} from "@/lib/playlists";
import { Popover, MenuItem, type PopoverAnchor } from "@/components/Popover";
import { ConfirmModal } from "@/components/Modal";

function anchorFromEvent(e: React.MouseEvent<HTMLElement>): PopoverAnchor {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
}

export function Sidebar({
  likedCount,
  playlists,
  open,
  onClose,
}: {
  likedCount: number;
  playlists: PlaylistSummaryServer[];
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const playTrack = usePlayer((s) => s.playTrack);

  // Ferme le drawer mobile à chaque navigation.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const [createAnchor, setCreateAnchor] = useState<PopoverAnchor | null>(null);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuPlaylistId, setMenuPlaylistId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function comingSoon(label: string) {
    push(`${label} — bientôt disponible`, "info");
  }

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    const name = createName.trim();
    if (!name || creating) return;
    setCreating(true);
    const row = await createPlaylist(name);
    setCreating(false);
    if (!row) {
      push("Création impossible", "error");
      return;
    }
    setCreateName("");
    setCreateAnchor(null);
    push(`Playlist « ${row.name} » créée ✓`, "success");
    router.refresh();
    router.push(`/playlist/${row.id}`);
  }

  async function handlePlay(id: string) {
    const detail = await fetchPlaylistDetail(id);
    if (!detail || !detail.tracks.length) {
      push("Playlist vide", "info");
      return;
    }
    const tracks = detail.tracks.map((t) => t.track);
    await playTrack(tracks[0], tracks);
    push(`Lecture : ${detail.name}`, "success");
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    const ok = await updatePlaylist(id, { name });
    setRenamingId(null);
    if (!ok) {
      push("Renommage impossible", "error");
      return;
    }
    push("Playlist renommée ✓", "success");
    router.refresh();
  }

  async function handleDuplicate(id: string) {
    setMenuPlaylistId(null);
    setMenuAnchor(null);
    const row = await duplicatePlaylist(id);
    if (!row) {
      push("Duplication impossible", "error");
      return;
    }
    push(`Playlist dupliquée ✓`, "success");
    router.refresh();
    router.push(`/playlist/${row.id}`);
  }

  async function handleDelete() {
    const playlist = playlists.find((p) => p.id === deleteId);
    if (!deleteId) return;
    setDeleting(true);
    const ok = await deletePlaylist(deleteId);
    setDeleting(false);
    if (!ok) {
      push("Suppression impossible", "error");
      return;
    }
    setDeleteId(null);
    push(`Playlist « ${playlist?.name ?? ""} » supprimée`, "success");
    if (pathname === `/playlist/${deleteId}`) router.push("/");
    router.refresh();
  }

  const menuPlaylist = playlists.find((p) => p.id === menuPlaylistId) ?? null;
  const deletePlaylistRow = playlists.find((p) => p.id === deleteId) ?? null;

  return (
    <>
      {/* Backdrop mobile */}
      {open && (
        <div
          className="fixed inset-x-0 top-0 bottom-[90px] z-[65] bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        aria-label="Navigation principale"
        className={`fixed top-0 bottom-[90px] lg:bottom-0 left-0 z-[70] w-[220px] bg-panel border-r border-edge flex flex-col justify-between overflow-y-auto pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="flex flex-col">
        <div className="h-16 px-4 flex items-center gap-2.5 border-b border-edge">
          <span className="flex h-7 w-7 items-center justify-center rounded-card bg-accent">
            <ListMusic size={16} className="text-white" />
          </span>
          <span className="font-display text-[17px] font-bold tracking-tight text-white">
            Resonance
          </span>
        </div>

        <nav className="p-2 space-y-0.5">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-card transition-colors text-[13px] ${
              pathname === "/"
                ? "bg-hover text-white font-medium"
                : "text-ink-soft hover:bg-hover hover:text-white"
            }`}
          >
            <Home size={18} className="text-accent" />
            <span>Accueil</span>
          </Link>
          <Link
            href="/discover"
            aria-current={pathname === "/discover" ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-card transition-colors text-[13px] ${
              pathname === "/discover"
                ? "bg-hover text-white font-medium"
                : "text-ink-soft hover:bg-hover hover:text-white"
            }`}
          >
            <Sparkles size={18} className="text-accent" />
            <span>Découvrir</span>
          </Link>
          <Link
            href="/search"
            aria-current={pathname === "/search" ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-card transition-colors text-[13px] ${
              pathname === "/search"
                ? "bg-hover text-white font-medium"
                : "text-ink-soft hover:bg-hover hover:text-white"
            }`}
          >
            <Search size={18} />
            <span>Rechercher</span>
          </Link>
        </nav>

        <div className="px-4 pt-4 pb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            Playlists
          </span>
          <div className="flex items-center gap-1">
            {playlists.length > 0 && (
              <span className="text-[11px] px-1.5 py-0.2 rounded-[6px] bg-card text-ink-muted font-mono">
                {playlists.length}
              </span>
            )}
            <button
              onClick={(e) => {
                setCreateName("");
                setCreateAnchor(anchorFromEvent(e));
              }}
              aria-label="Créer une playlist"
              title="Créer une playlist"
              className="rounded p-1 text-ink-muted hover:bg-hover hover:text-white transition-colors"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
        <div className="px-2 space-y-0.5">
          {playlists.length === 0 ? (
            <p className="px-3 py-1.5 text-[12px] text-ink-muted">
              Aucune playlist pour l&apos;instant.
            </p>
          ) : (
            playlists.map((p) => {
              const active = pathname === `/playlist/${p.id}`;
              if (renamingId === p.id) {
                return (
                  <div key={p.id} className="px-3 py-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void handleRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRename(p.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full rounded-card border border-accent bg-base px-2 py-1 text-[13px] text-white outline-none"
                    />
                  </div>
                );
              }
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/playlist/${p.id}`)}
                  className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-card transition-colors cursor-pointer ${
                    active
                      ? "bg-hover text-white"
                      : "text-ink-soft hover:bg-hover hover:text-white"
                  }`}
                >
                  <div className="h-6 w-6 shrink-0 overflow-hidden rounded-[6px] bg-card flex items-center justify-center">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-ink-muted">♪</span>
                    )}
                  </div>
                  <span className="truncate text-[13px] flex-1">{p.name}</span>
                  {p.trackCount > 0 && (
                    <span className="text-[11px] text-ink-muted font-mono shrink-0">
                      {p.trackCount}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePlay(p.id);
                    }}
                    aria-label={`Lire ${p.name}`}
                    className="shrink-0 rounded-full p-1 text-ink-soft opacity-0 group-hover:opacity-100 hover:text-accent transition"
                  >
                    <Play size={13} fill="currentColor" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuPlaylistId(p.id);
                      setMenuAnchor(anchorFromEvent(e));
                    }}
                    aria-label={`Options de ${p.name}`}
                    className="shrink-0 rounded p-1 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-white transition"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 pt-4 pb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            Bibliothèque
          </span>
        </div>
        <div className="px-2 space-y-0.5 pb-4">
          <Link
            href="/liked"
            className="flex items-center justify-between px-3 py-1.5 rounded-card text-ink-soft hover:bg-hover hover:text-white transition-colors group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Heart size={16} className="text-accent" fill={pathname === "/liked" ? "currentColor" : "none"} />
              <span className="truncate text-[13px]">Titres likés</span>
            </div>
            {likedCount > 0 && (
              <span className="text-[11px] px-1.5 py-0.2 rounded-[6px] bg-card text-ink-muted font-mono group-hover:text-ink-soft">
                {likedCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => comingSoon("Albums sauvegardés")}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-card text-ink-soft hover:bg-hover hover:text-white transition-colors"
          >
            <Album size={16} className="text-ink-muted" />
            <span className="truncate text-[13px]">Albums sauvegardés</span>
          </button>
          <button
            onClick={() => comingSoon("Artistes suivis")}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-card text-ink-soft hover:bg-hover hover:text-white transition-colors"
          >
            <User size={16} className="text-ink-muted" />
            <span className="truncate text-[13px]">Artistes suivis</span>
          </button>
          <button
            onClick={() => comingSoon("Fichiers locaux")}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-card text-ink-soft hover:bg-hover hover:text-white transition-colors"
          >
            <Folder size={16} className="text-ink-muted" />
            <span className="truncate text-[13px]">Fichiers locaux</span>
          </button>
        </div>
      </div>

      <div className="p-3 border-t border-edge">
        <button
          onClick={(e) => {
            setCreateName("");
            setCreateAnchor(anchorFromEvent(e));
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-card border border-edge bg-card hover:bg-hover text-white text-[12px] font-medium transition-colors"
        >
          <ListPlus size={16} />
          <span>Créer une playlist</span>
        </button>
      </div>

      <Popover anchor={createAnchor} onClose={() => setCreateAnchor(null)}>
        <form onSubmit={(e) => void handleCreate(e)} className="p-3 space-y-2.5">
          <p className="text-[13px] font-semibold text-white">Nouvelle playlist</p>
          <input
            autoFocus={!!createAnchor}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Nom de la playlist"
            maxLength={80}
            className="w-full rounded-card border border-edge bg-base px-2.5 py-1.5 text-[13px] text-white placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!createName.trim() || creating}
            className="w-full rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold py-2 transition-colors disabled:opacity-60"
          >
            {creating ? "..." : "Créer"}
          </button>
        </form>
      </Popover>

      <Popover
        anchor={menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuPlaylistId(null);
        }}
      >
        {menuPlaylist && (
          <>
            <MenuItem
              icon={<Play size={14} />}
              onClick={() => {
                setMenuAnchor(null);
                setMenuPlaylistId(null);
                void handlePlay(menuPlaylist.id);
              }}
            >
              Lire
            </MenuItem>
            <MenuItem
              icon={<Pencil size={14} />}
              onClick={() => {
                setRenameValue(menuPlaylist.name);
                setRenamingId(menuPlaylist.id);
                setMenuAnchor(null);
                setMenuPlaylistId(null);
              }}
            >
              Renommer
            </MenuItem>
            <MenuItem
              icon={<Copy size={14} />}
              onClick={() => void handleDuplicate(menuPlaylist.id)}
            >
              Dupliquer
            </MenuItem>
            <MenuItem
              icon={<Trash2 size={14} />}
              danger
              onClick={() => {
                setDeleteId(menuPlaylist.id);
                setMenuAnchor(null);
                setMenuPlaylistId(null);
              }}
            >
              Supprimer
            </MenuItem>
          </>
        )}
      </Popover>

      <ConfirmModal
        open={deleteId !== null}
        title={`Supprimer définitivement « ${deletePlaylistRow?.name ?? ""} » ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => {
          if (!deleting) setDeleteId(null);
        }}
      />
      </aside>
    </>
  );
}
