import type { PlayerAdapter, AdapterState } from "@/lib/player/adapter";
import { loadScript } from "@/lib/player/adapter";
import type { Track } from "@/lib/types";

declare global {
  interface Window {
    SC?: {
      Widget: {
        load: (el: HTMLElement) => SCWidget;
      };
      WidgetEvents: Record<string, string>;
    };
  }
}

interface SCWidget {
  bind(event: string, cb: (data: unknown) => void): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  setVolume(v: number): void;
  getCurrentPosition(cb: (ms: number) => void): void;
  getDuration(cb: (ms: number) => void): void;
  load(url: string, options?: Record<string, unknown>): void;
}

let apiPromise: Promise<void> | null = null;

function loadSC(): Promise<void> {
  if (!apiPromise) {
    apiPromise = loadScript(
      "https://w.soundcloud.com/player/api.js",
      "sc-widget-api"
    );
  }
  return apiPromise;
}

export class SoundCloudAdapter implements PlayerAdapter {
  private widget: SCWidget | null = null;
  private cb: ((state: AdapterState) => void) | null = null;
  private duration = 0;
  private cachedPosition = 0;
  private boundCb: ((data: unknown) => void) | null = null;
  private boundReady: (() => void) | null = null;

  on(cb: (state: AdapterState) => void) {
    this.cb = cb;
  }

  async mount(el: HTMLElement, track: Track, autoplay: boolean) {
    await loadSC();

    const iframe = document.createElement("iframe");
    iframe.id = `sc-widget-${Date.now()}`;
    iframe.width = "100%";
    iframe.height = "166";
    iframe.allow = "autoplay";
    iframe.src =
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.sourceUrl)}` +
      `&auto_play=${autoplay ? "true" : "false"}&visual=false&show_comments=false&buying=false&sharing=false`;
    el.innerHTML = "";
    el.appendChild(iframe);

    const SC = window.SC!;

    // Même garde que les autres adapters : un widget qui ne devient
    // jamais prêt ne doit pas bloquer loadAndPlay indéfiniment.
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (failed: boolean) => {
        if (settled) return;
        settled = true;
        if (failed) this.cb?.("unavailable");
        resolve();
      };
      const timer = setTimeout(() => finish(true), 8000);
      this.widget = SC.Widget.load(iframe);
      this.boundReady = () => {
        this.widget?.getDuration((d) => {
          this.duration = d;
        });
        clearTimeout(timer);
        finish(false);
      };
      this.boundCb = (data) => {
        const event = data as { type: number };
        const events = SC.WidgetEvents;
        if (event.type === Number(events.FINISH)) this.cb?.("ended");
        else if (event.type === Number(events.PLAY)) this.cb?.("playing");
        else if (event.type === Number(events.PAUSE)) this.cb?.("paused");
        else if (event.type === Number(events.ERROR)) this.cb?.("unavailable");
        else if (event.type === Number(events.READY)) this.boundReady?.();
      };
      this.widget.bind("*", this.boundCb);
    });
  }

  destroy() {
    this.widget = null;
    this.boundCb = null;
  }
  play() {
    this.widget?.play();
  }
  pause() {
    this.widget?.pause();
  }
  seek(ms: number) {
    this.widget?.seekTo(ms);
  }
  setVolume(v: number) {
    this.widget?.setVolume(Math.round(v * 100));
  }
  getPositionMs() {
    this.widget?.getCurrentPosition((p) => {
      this.cachedPosition = p;
    });
    return this.cachedPosition;
  }
  getDurationMs() {
    return this.duration;
  }
}
