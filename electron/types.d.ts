export {};

declare global {
  interface MiniTrackSnapshot {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
  }

  interface MiniSnapshot {
    track: MiniTrackSnapshot | null;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
  }

  type MiniCommand =
    | { type: "toggle" }
    | { type: "next" }
    | { type: "previous" }
    | { type: "seek"; value: number }
    | { type: "sync" };

  interface Window {
    resonance?: {
      isElectron: boolean;
      onMediaKey: (cb: (action: "toggle" | "next" | "previous") => void) => () => void;
      setPlaybackState: (state: {
        isPlaying: boolean;
        hasTrack: boolean;
        locale: "fr" | "en";
      }) => void;
      sendMiniState: (state: MiniSnapshot) => void;
      onMiniState: (cb: (state: MiniSnapshot) => void) => () => void;
      sendMiniCommand: (cmd: MiniCommand) => void;
      onMiniCommand: (cb: (cmd: MiniCommand) => void) => () => void;
      openMiniWindow: () => void;
      expandMainWindow: () => void;
    };
  }
}
