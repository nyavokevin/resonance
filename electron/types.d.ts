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

  interface DiscordActivityPayload {
    title: string;
    artist: string;
    coverUrl?: string | null;
    durationMs?: number;
    positionMs?: number;
    isPlaying: boolean;
  }

  interface NotifyPayload {
    title: string;
    body: string;
    route?: string;
  }

  /** Statut d'update relayé par le processus main (auto-updater). */
  type UpdateStatus =
    | { event: "checking" }
    | { event: "available"; version: string }
    | { event: "none" }
    | { event: "progress"; percent: number; mb: number }
    | { event: "downloaded"; version: string }
    | {
        event: "error";
        message?: string;
        /** Code machine optionnel mappé par le renderer (ex. dev-not-available, timeout). */
        code?: string;
      };

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
      setDiscordActivity: (activity: DiscordActivityPayload) => void;
      clearDiscordActivity: () => void;
      notify: (payload: NotifyPayload) => void;
      onNotificationClick: (cb: (route: string) => void) => () => void;
      update: {
        checkForUpdates: (manual: boolean) => void;
        onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;
        setAutoDownload: (on: boolean) => void;
        getAppVersion: () => Promise<string>;
      };
    };
  }
}
