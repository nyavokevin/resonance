"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/player/engine";
import { useToasts } from "@/lib/toast-store";
import { saveSharedPlaylist, type PlaylistTrackRow } from "@/lib/playlists";
import { PlaylistView } from "@/components/PlaylistView";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

export function SharePlaylistView({
  initial,
  creatorName,
}: {
  initial: {
    id: string;
    name: string;
    description: string;
    coverUrl?: string;
    isPublic: boolean;
    shareToken: string | null;
    isOwner: false;
    ownerId: string;
    tracks: PlaylistTrackRow[];
  };
  creatorName?: string;
}) {
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const t = useT();
  const playTrack = usePlayer((s) => s.playTrack);
  const [saving, setSaving] = useState(false);

  const list = initial.tracks.map((t) => t.track);

  async function handleListen() {
    if (!list.length) return;
    await playTrack(list[0], list);
    push(fmt(t.playlist.playing, { name: initial.name }), "success");
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const row = await saveSharedPlaylist(
      initial.name,
      initial.description,
      list
    );
    setSaving(false);
    if (!row) {
      push(t.share.saveImpossible, "error");
      return;
    }
    push(t.share.playlistSaved, "success");
    router.refresh();
    router.push(`/playlist/${row.id}`);
  }

  return (
    <PlaylistView
      initial={initial}
      share={{
        creatorName,
        saving,
        onSaveCopy: () => void handleSave(),
        onListen: () => void handleListen(),
      }}
    />
  );
}
