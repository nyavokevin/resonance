import type { PlayerAdapter, AdapterState } from "@/lib/player/adapter";
import type { Track } from "@/lib/types";

export class DirectAdapter implements PlayerAdapter {
  private audio: HTMLAudioElement | null = null;
  private cb: ((state: AdapterState) => void) | null = null;

  on(cb: (state: AdapterState) => void) {
    this.cb = cb;
  }

  async mount(el: HTMLElement, track: Track, autoplay: boolean) {
    const audio = new Audio(track.sourceUrl);
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    this.audio = audio;

    audio.addEventListener("playing", () => this.cb?.("playing"));
    audio.addEventListener("pause", () => this.cb?.("paused"));
    audio.addEventListener("waiting", () => this.cb?.("buffering"));
    audio.addEventListener("ended", () => this.cb?.("ended"));
    audio.addEventListener("error", () => this.cb?.("unavailable"));
    audio.addEventListener("loadedmetadata", () => this.cb?.("paused"));

    if (autoplay) {
      try {
        await audio.play();
      } catch {
        this.cb?.("paused");
      }
    } else {
      // Sans metadata chargée, un seek ultérieur serait perdu en silence.
      await new Promise<void>((resolve) => {
        if (audio.readyState >= 1) {
          resolve();
          return;
        }
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        audio.addEventListener("loadedmetadata", finish, { once: true });
        audio.addEventListener("error", finish, { once: true });
        setTimeout(finish, 4000);
      });
    }
  }

  destroy() {
    this.audio?.pause();
    this.audio = null;
  }
  play() {
    this.audio?.play().catch(() => {});
  }
  pause() {
    this.audio?.pause();
  }
  seek(ms: number) {
    if (this.audio) this.audio.currentTime = ms / 1000;
  }
  setVolume(v: number) {
    if (this.audio) this.audio.volume = v;
  }
  getPositionMs() {
    return (this.audio?.currentTime ?? 0) * 1000;
  }
  getDurationMs() {
    return (this.audio?.duration ?? 0) * 1000;
  }
}
