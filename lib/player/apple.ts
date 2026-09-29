import type { PlayerAdapter, AdapterState } from "@/lib/player/adapter";
import type { Track } from "@/lib/types";

export class AppleMusicAdapter implements PlayerAdapter {
  private cb: ((state: AdapterState) => void) | null = null;

  on(cb: (state: AdapterState) => void) {
    this.cb = cb;
  }

  async mount(el: HTMLElement, track: Track, autoplay: boolean) {
    void autoplay;
    el.innerHTML =
      `<iframe src="https://embed.music.apple.com/fr/track/${track.platformTrackId}" ` +
      `width="100%" height="150" frameborder="0" allow="autoplay; encrypted-media" ` +
      `sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-presentation" loading="lazy"></iframe>`;
    this.cb?.("paused");
  }

  destroy() {
    // iframe nettoyé au démontage du conteneur
  }
  play() {
    this.cb?.("playing");
  }
  pause() {
    this.cb?.("paused");
  }
  seek() {}
  setVolume() {}
  getPositionMs() {
    return 0;
  }
  getDurationMs() {
    return 0;
  }
}
