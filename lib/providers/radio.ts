export interface RadioCandidate {
  videoId: string;
  title: string;
  channel: string;
  durationMs: number;
  thumbnail?: string;
}

const MAX_DURATION_MS = 12 * 60 * 1000;

function parseDuration(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const parts = text.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0) * 1000;
}

function textOf(node: unknown): string {
  const obj = node as { runs?: Array<{ text: string }>; simpleText?: string } | undefined;
  return obj?.runs?.[0]?.text ?? obj?.simpleText ?? "";
}

/** Recommandations "Up next" d'une page watch YouTube (même technique que search.ts). */
export async function fetchUpNext(videoId: string): Promise<RadioCandidate[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    signal: AbortSignal.timeout(10000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{.+?\});<\/script>/);
  if (!match) return [];

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const results: RadioCandidate[] = [];

  function pushResult(
    videoId: string,
    title: string,
    channel: string,
    durationMs: number | undefined,
    thumbnail?: string
  ) {
    // Durée requise et < 12 min : exclut lives et mixes.
    if (!title || !durationMs || durationMs >= MAX_DURATION_MS) return;
    if (!videoId || videoId.length !== 11) return;
    if (results.some((r) => r.videoId === videoId)) return;
    results.push({ videoId, title, channel, durationMs, thumbnail });
  }

  function collectLockup(lockup: Record<string, unknown>) {
    if (lockup.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return;
    let videoId =
      typeof lockup.contentId === "string" ? lockup.contentId : "";
    const meta = (lockup.metadata as Record<string, unknown> | undefined)
      ?.lockupMetadataViewModel as Record<string, unknown> | undefined;
    const title =
      ((meta?.title as { content?: string } | undefined)?.content ?? "").trim();
    let channel = "";
    const avatarLabel = (
      (meta?.image as Record<string, unknown> | undefined)
        ?.decoratedAvatarViewModel as Record<string, unknown> | undefined
    )?.a11yLabel;
    if (typeof avatarLabel === "string") {
      channel = avatarLabel.replace(/^Go to channel\s+/i, "").trim();
    }
    const image = (lockup.contentImage as Record<string, unknown> | undefined)
      ?.thumbnailViewModel as Record<string, unknown> | undefined;
    const sources = (
      (image?.image as Record<string, unknown> | undefined)?.sources as
        | Array<{ url?: string }>
        | undefined
    );
    const thumbnail = sources?.find((s) => s.url)?.url;
    if (!videoId && thumbnail) {
      const m = thumbnail.match(/\/vi\/([^/]+)\//);
      if (m) videoId = m[1];
    }
    let durationText: string | undefined;
    const overlays = (image?.overlays as Array<unknown> | undefined) ?? [];
    const findBadge = (node: unknown): void => {
      if (durationText || !node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(findBadge);
        return;
      }
      const obj = node as Record<string, unknown>;
      const badge = obj.thumbnailBadgeViewModel as
        | { text?: string }
        | undefined;
      if (typeof badge?.text === "string" && /^\d+:\d+(:\d+)?$/.test(badge.text)) {
        durationText = badge.text;
        return;
      }
      for (const key of Object.keys(obj)) findBadge(obj[key]);
    };
    findBadge(overlays);
    pushResult(videoId, title, channel || "YouTube", parseDuration(durationText), thumbnail);
  }

  function collect(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    const obj = node as Record<string, unknown>;
    const lockup = obj.lockupViewModel as Record<string, unknown> | undefined;
    if (lockup) {
      collectLockup(lockup);
      return;
    }
    const vr = obj.compactVideoRenderer as Record<string, unknown> | undefined;
    if (vr && typeof vr.videoId === "string") {
      const thumbs = (vr.thumbnail as { thumbnails?: Array<{ url: string }> })
        ?.thumbnails;
      pushResult(
        vr.videoId,
        textOf(vr.title) || "Vidéo YouTube",
        textOf(vr.longBylineText) || textOf(vr.shortBylineText) || "YouTube",
        parseDuration((vr.lengthText as { simpleText?: string })?.simpleText),
        thumbs?.at(-1)?.url
      );
      return;
    }
    for (const key of Object.keys(obj)) {
      collect(obj[key]);
    }
  }

  collect(data);
  return results;
}
