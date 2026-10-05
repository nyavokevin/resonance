"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { joinInvitedSession } from "@/lib/jam";
import { createClient } from "@/lib/supabase/client";
import { useT, useLocaleStore } from "@/lib/i18n/locale-store";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { useToasts } from "@/lib/toast-store";

/**
 * Landing des invitations Jam (lien de notification jam_invite) : join
 * direct = pré-approbation par le host, puis navigation vers /jam où le
 * store Jam contient déjà la session (participants/tracks, pas l'écran de
 * création). Session terminée/introuvable → toast d'erreur, pas de nav.
 */
export default function JamInviteLanding() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const push = useToasts((s) => s.push);
  const visitedRef = useRef<string | null>(null);

  useEffect(() => {
    void (async () => {
      const id = pathname.split("/").filter(Boolean).pop();
      if (!id || visitedRef.current === id) return;
      visitedRef.current = id;
      const { data } = await createClient().auth.getUser();
      const uid = data.user?.id;
      if (!uid) {
        push(t.jam.sessionNotFound, "error");
        return;
      }
      const joined = await joinInvitedSession(id, uid);
      if (!joined) {
        push(t.jam.sessionNotFound, "error");
        return;
      }
      push(
        dictionaries[useLocaleStore.getState().locale].jam.sessionJoined,
        "success"
      );
      router.push("/jam");
    })();
  }, [pathname, t, push, router]);

  return <p className="text-[12px] text-ink-muted">{t.common.loading}</p>;
}