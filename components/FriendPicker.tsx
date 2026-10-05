"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { listFriends, type FriendshipWithProfile } from "@/lib/friends";
import { useT } from "@/lib/i18n/locale-store";
import { fmt } from "@/lib/i18n/dictionaries";

function FriendAvatar({ name }: { name: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base border border-edge text-[11px] font-semibold text-white uppercase">
      {(name || "?").charAt(0)}
    </span>
  );
}

/** Sélecteur d'amis (clone PlaylistPicker) : single pour partage de titre,
 * multi pour invitation Jam. Le parent possède l'état de sélection en multi. */
export function FriendPicker({
  mode = "single",
  onSelect,
  selectedIds = [],
  onToggle,
  onConfirm,
  confirming = false,
}: {
  mode?: "single" | "multi";
  onSelect?: (friendId: string) => void;
  selectedIds?: string[];
  onToggle?: (friendId: string) => void;
  onConfirm?: () => void;
  confirming?: boolean;
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listFriends()
      .then((rows) => {
        if (cancelled) return;
        setFriends(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? friends.filter((f) =>
        (f.profile?.display_name ?? "").toLowerCase().includes(q)
      )
    : friends;
  const selected = new Set(selectedIds);

  return (
    <div className="w-64">
      <div className="px-3 pt-2.5 pb-1.5 border-b border-edge">
        <p className="text-[13px] font-semibold text-white">
          {mode === "multi" ? t.friendPicker.multi : t.friendPicker.single}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.friendPicker.title}
          maxLength={60}
          className="mt-2 w-full rounded-card border border-edge bg-base px-2 py-1.5 text-[12px] text-white placeholder:text-ink-muted outline-none focus:border-accent transition-colors"
        />
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {loading ? (
          <p className="px-3 py-3 text-[12px] text-ink-muted">{t.common.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-ink-muted">{t.friendPicker.empty}</p>
        ) : (
          filtered.map(({ otherId, profile }) => {
            const name = profile?.display_name || otherId.slice(0, 8);
            const checked = selected.has(otherId);
            return (
              <button
                key={otherId}
                onClick={() =>
                  mode === "multi" ? onToggle?.(otherId) : onSelect?.(otherId)
                }
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors text-ink-soft hover:bg-hover hover:text-white"
              >
                <FriendAvatar name={profile?.display_name ?? "?"} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{name}</span>
                {mode === "multi" && checked && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })
        )}
      </div>
      {mode === "multi" && (
        <div className="p-2 border-t border-edge">
          <button
            onClick={() => onConfirm?.()}
            disabled={selectedIds.length === 0 || confirming}
            className="w-full rounded-card bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold py-2 transition-colors disabled:opacity-60"
          >
            {confirming ? "…" : fmt(t.friendPicker.confirm, { n: selectedIds.length })}
          </button>
        </div>
      )}
    </div>
  );
}
