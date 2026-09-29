export interface SearchResult {
  videoId: string;
  title: string;
  channel: string;
  durationMs?: number;
  thumbnail?: string;
}

function parseDuration(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const parts = text.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0) * 1000;
}

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  const url =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` +
    `&sp=EgIQAQ%253D%253D`;
  const res = await fetch(url, {
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

  const results: SearchResult[] = [];

  function collect(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    const obj = node as Record<string, unknown>;
    const vr = obj.videoRenderer as Record<string, unknown> | undefined;
    if (vr && typeof vr.videoId === "string") {
      const title =
        (vr.title as { runs?: Array<{ text: string }> })?.runs?.[0]?.text ??
        (vr.title as { simpleText?: string })?.simpleText ??
        "";
      const channel =
        (vr.ownerText as { runs?: Array<{ text: string }> })?.runs?.[0]?.text ??
        (vr.longBylineText as { runs?: Array<{ text: string }> })?.runs?.[0]?.text ??
        "YouTube";
      const lengthText = (vr.lengthText as { simpleText?: string })?.simpleText;
      const thumbs = (vr.thumbnail as { thumbnails?: Array<{ url: string }> })
        ?.thumbnails;
      const videoId = vr.videoId;
      const existing = results.some((r) => r.videoId === videoId);
      if (title && !existing) {
        results.push({
          videoId,
          title,
          channel,
          durationMs: parseDuration(lengthText),
          thumbnail: thumbs?.at(-1)?.url,
        });
      }
      return;
    }
    for (const key of Object.keys(obj)) {
      collect(obj[key]);
    }
  }

  collect(data);
  return results.slice(0, 12);
}
