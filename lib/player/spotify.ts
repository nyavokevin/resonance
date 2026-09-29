import type { PlayerAdapter, AdapterState } from "@/lib/player/adapter";
import type { Track } from "@/lib/types";

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (IFrameAPI: SpotifyIframeAPI) => void;
  }
}

interface SpotifyIframeAPI {
  createController(
    el: HTMLElement,
    options: { uri?: string; width?: string | number; height?: string | number },
    cb: (controller: SpotifyEmbedController) => void
  ): void;
}

interface SpotifyEmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seek(seconds: number): void;
  addListener(
    event: "playback_update",
    cb: (e: {
      data?: {
        position?: number;
        duration?: number;
        isPaused?: boolean;
      };
    }) => void
  ): void;
  addListener(event: "ready", cb: () => void): void;
  destroy(): void;
}

let apiPromise: Promise<SpotifyIframeAPI> | null = null;

function loadSpotifyAPI(): Promise<SpotifyIframeAPI> {
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      window.onSpotifyIframeApiReady = (api) => resolve(api);
      const script = document.createElement("script");
      script.id = "spotify-iframe-api";
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      script.onerror = () => reject(new Error("Spotify IFrame API failed"));
      document.head.appendChild(script);
      setTimeout(() => reject(new Error("Spotify IFrame API timeout")), 10000);
    });
  }
  return apiPromise;
}

export class SpotifyAdapter implements PlayerAdapter {
  private controller: SpotifyEmbedController | null = null;
  private cb: ((state: AdapterState) => void) | null = null;
  private position = 0;
  private duration = 0;

  on(cb: (state: AdapterState) => void) {
    this.cb = cb;
  }

  async mount(el: HTMLElement, track: Track, autoplay: boolean) {
    const api = await loadSpotifyAPI();
    // Sans timeout, un embed qui ne répond jamais (mur de login, pub,
    // restriction) bloquerait loadAndPlay indéfiniment (00:00 figé).
    // Au timeout on signale "unavailable" pour déclencher fallback/suivant.
    let controller: SpotifyEmbedController | null = null;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (failed: boolean) => {
        if (settled) return;
        settled = true;
        if (failed) this.cb?.("unavailable");
        resolve();
      };
      const timer = setTimeout(() => {
        controller?.destroy();
        controller = null;
        finish(true);
      }, 8000);
      api.createController(
        el,
        {
          uri: track.embedUri ?? `spotify:track:${track.platformTrackId}`,
          width: "100%",
          height: 80,
        },
        (c) => {
          controller = c;
          this.controller = c;
          clearTimeout(timer);
          controller.addListener("playback_update", (e) => {
            const payload = e.data ?? {};
            let position = payload.position ?? 0;
            let duration = payload.duration ?? 0;
            if (duration > 0 && duration < 10000) {
              position *= 1000;
              duration *= 1000;
            }
            this.position = position;
            this.duration = duration;
            const paused = payload.isPaused ?? true;
            if (duration > 0 && position >= duration - 50) {
              this.cb?.("ended");
            } else {
              this.cb?.(paused ? "paused" : "playing");
            }
          });
          finish(false);
        }
      );
    });
    if (autoplay) this.controller?.play();
  }

  destroy() {
    this.controller?.destroy();
    this.controller = null;
  }
  play() {
    this.controller?.play();
  }
  pause() {
    this.controller?.pause();
  }
  seek(ms: number) {
    this.controller?.seek(ms / 1000);
  }
  setVolume() {}
  getPositionMs() {
    return this.position;
  }
  getDurationMs() {
    return this.duration;
  }
}
