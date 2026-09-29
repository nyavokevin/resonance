export {};

declare global {
  interface Window {
    resonance?: {
      isElectron: boolean;
      onMediaKey: (cb: (action: "toggle" | "next" | "previous") => void) => void;
    };
  }
}
