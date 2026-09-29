"use client";

import { useJam } from "@/lib/jam-store";
import { addTrackToJam } from "@/lib/jam";
import { usePlayer } from "@/lib/player/engine";
import type { Track } from "@/lib/types";

export type QueueAddResult = "added" | "moved" | "shared" | "failed";

/**
 * Ajout en fin de file, avec routing Jam :
 * - hors Jam ou host → file locale (dédup → déplacement, statut "moved")
 * - invité → file partagée via jam_add_track (toujours "shared")
 */
export async function smartAddToQueue(track: Track): Promise<QueueAddResult> {
  const { session } = useJam.getState();
  if (!session || session.isHost) {
    return usePlayer.getState().addToQueue(track);
  }
  const ok = await addTrackToJam(session.id, track);
  return ok ? "shared" : "failed";
}

/**
 * "Lire ensuite" : insertion en position 1 de la file. Invité Jam :
 * pas de contrôle de position sur la file partagée → ajout en fin
 * (signalé par le statut "shared").
 */
export async function smartPlayNext(track: Track): Promise<QueueAddResult> {
  const { session } = useJam.getState();
  if (!session || session.isHost) {
    return usePlayer.getState().playNext(track);
  }
  const ok = await addTrackToJam(session.id, track);
  return ok ? "shared" : "failed";
}

/** Toast centralisé pour les résultats d'ajout de file. */
export function toastQueueResult(
  push: (message: string, type?: "info" | "success" | "error") => void,
  result: QueueAddResult,
  title: string
) {
  if (result === "moved") {
    push("Déjà dans la file — déplacé en position suivante", "info");
  } else if (result === "added") {
    push(`Ajouté à la file : ${title} ✓`, "success");
  } else if (result === "shared") {
    push(`Ajouté à la file partagée : ${title} ✓`, "success");
  } else {
    push("Ajout impossible", "error");
  }
}