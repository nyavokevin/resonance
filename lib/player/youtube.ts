import type { PlayerAdapter, AdapterState } from "@/lib/player/adapter";
import { loadScript } from "@/lib/player/adapter";
import type { Track } from "@/lib/types";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        options: {
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayer;
      PlayerState: Record<string, number>;
    };
    onYouTubeIframeAPIReady?: () => void;
    onYouTubeIframeAPIReadyCalled?: boolean;
  }
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

let apiPromise: Promise<void> | null = null;

function loadYT(): Promise<void> {
  if (!apiPromise) {
    apiPromise = loadScript(
      "https://www.youtube.com/iframe_api",
      "yt-iframe-api"
    ).then(
      () =>
        new Promise<void>((resolve) => {
          if (window.onYouTubeIframeAPIReadyCalled) {
            resolve();
            return;
          }
          const prev = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = () => {
            window.onYouTubeIframeAPIReadyCalled = true;
            prev?.();
            resolve();
          };
        })
    );
  }
  return apiPromise;
}

export class YouTubeAdapter implements PlayerAdapter {
  private player: YTPlayer | null = null;
  private cb: ((state: AdapterState) => void) | null = null;
  private lastState = -1;
  private ready = false;

  on(cb: (state: AdapterState) => void) {
    this.cb = cb;
  }

  async mount(el: HTMLElement, track: Track, autoplay: boolean) {
    await loadYT();
    const YT = window.YT!;
    this.ready = false;
    // Le mount résout sur onReady : un seek appelé juste après (rejoinJam,
    // correction de dérive) atterrit vraiment au lieu d'être ignoré.
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      this.player = new YT.Player(el, {
        videoId: track.platformTrackId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this.ready = true;
            this.player?.setVolume(100);
            if (autoplay) this.player?.playVideo();
            finish();
          },
          onStateChange: (e) => {
            const S = YT.PlayerState;
            const map: Record<number, AdapterState> = {
              [S.PLAYING]: "playing",
              [S.PAUSED]: "paused",
              [S.BUFFERING]: "buffering",
              [S.ENDED]: "ended",
            };
            const mapped = map[e.data];
            if (mapped && e.data !== this.lastState) {
              this.lastState = e.data;
              this.cb?.(mapped);
            }
          },
          onError: () => {
            this.cb?.("unavailable");
            finish();
          },
        },
      });
      setTimeout(finish, 5000);
    });
  }

  destroy() {
    if (this.ready) this.player?.destroy();
    this.player = null;
  }
  play() {
    if (!this.ready) return;
    this.player?.playVideo();
  }
  pause() {
    if (!this.ready) return;
    this.player?.pauseVideo();
  }
  seek(ms: number) {
    if (!this.ready) return;
    this.player?.seekTo(ms / 1000, true);
  }
  setVolume(v: number) {
    if (!this.ready) return;
    this.player?.setVolume(Math.round(v * 100));
  }
  getPositionMs() {
    if (!this.ready) return 0;
    return (this.player?.getCurrentTime() ?? 0) * 1000;
  }
  getDurationMs() {
    if (!this.ready) return 0;
    return (this.player?.getDuration() ?? 0) * 1000;
  }
}
