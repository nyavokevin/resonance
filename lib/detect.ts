import type { LinkKind, Platform } from "@/lib/types";

export interface DetectedLink {
  platform: Platform;
  kind: LinkKind;
  id: string;
  url: string;
}

const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|flac|aac|opus|webm|mp4)(\?.*)?$/i;

export function isDirectAudio(url: string): boolean {
  return AUDIO_EXT.test(url);
}

export function detectLink(raw: string): DetectedLink | null {
  const input = raw.trim();
  if (!input) return null;

  if (isDirectAudio(input)) {
    const filename = input.split("/").pop()?.split("?")[0] ?? "audio";
    return {
      platform: "direct",
      kind: "direct",
      id: decodeURIComponent(filename),
      url: input,
    };
  }

  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/$/, "");

  if (host.endsWith("spotify.com")) {
    const parts = path.split("/").filter(Boolean);
    const idx = parts.findIndex((p) =>
      ["track", "album", "playlist"].includes(p)
    );
    if (idx === -1) return null;
    const kind = parts[idx] as LinkKind;
    const id = parts[idx + 1]?.split("?")[0];
    if (!id) return null;
    return {
      platform: "spotify",
      kind: kind === "track" ? "track" : kind,
      id,
      url: input,
    };
  }

  if (host === "youtu.be") {
    const id = path.slice(1);
    return id
      ? { platform: "youtube", kind: "track", id, url: input }
      : null;
  }

  if (host.endsWith("youtube.com")) {
    const isMusic = host === "music.youtube.com";
    const platform: Platform = isMusic ? "youtube-music" : "youtube";
    const listId = url.searchParams.get("list");
    const videoId = url.searchParams.get("v") ?? path.split("/").pop() ?? "";

    if (path.startsWith("/playlist") && listId) {
      return { platform, kind: "playlist", id: listId, url: input };
    }
    if (path.startsWith("/watch") && (videoId || listId)) {
      return {
        platform,
        kind: videoId ? "track" : "playlist",
        id: videoId || listId!,
        url: input,
      };
    }
    if (videoId) {
      return { platform, kind: "track", id: videoId, url: input };
    }
    return null;
  }

  if (host.endsWith("music.apple.com")) {
    // format: /{cc}/album/{slug}/{albumId}?i={trackId}
    const segments = path.split("/").filter(Boolean);
    const albumIdx = segments.indexOf("album");
    const trackId = url.searchParams.get("i");
    const albumId = albumIdx !== -1 ? segments[albumIdx + 2] : segments.at(-1);
    if (trackId) {
      return { platform: "apple-music", kind: "track", id: trackId, url: input };
    }
    if (albumId) {
      return { platform: "apple-music", kind: "album", id: albumId, url: input };
    }
    return null;
  }

  if (host.endsWith("soundcloud.com")) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
      platform: "soundcloud",
      kind: "track",
      id: parts.slice(0, 2).join("/"),
      url: input,
    };
  }

  return null;
}
