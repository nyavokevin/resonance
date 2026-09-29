import type { Track } from "@/lib/types";

export type AdapterState =
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "unavailable";

export interface PlayerAdapter {
  mount(el: HTMLElement, track: Track, autoplay: boolean): Promise<void>;
  destroy(): void;
  play(): void;
  pause(): void;
  seek(ms: number): void;
  setVolume(v: number): void;
  getPositionMs(): number;
  getDurationMs(): number;
  on(cb: (state: AdapterState) => void): void;
}

export function loadScript(src: string, id: string): Promise<void> {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
