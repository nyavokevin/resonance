import { NextResponse } from "next/server";
import { clearBrowseCache } from "@/lib/providers/spotify-api";

/** Force l'expiration du cache browse 15min (bouton ↻ de /discover). */
export async function POST() {
  clearBrowseCache();
  return NextResponse.json({ ok: true });
}
