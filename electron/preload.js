const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resonance", {
  onMediaKey: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("resonance:media-key", handler);
    // Returns an unsubscribe function so renderers can avoid
    // stacking duplicate listeners across remounts/HMR.
    return () => ipcRenderer.removeListener("resonance:media-key", handler);
  },
  setPlaybackState: (state) => {
    ipcRenderer.send("resonance:playback-state", state);
  },
  // Floating mini window: the main window owns playback and pushes
  // snapshots; the mini window sends back transport commands.
  sendMiniState: (state) => {
    ipcRenderer.send("resonance:mini-state", state);
  },
  onMiniState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("resonance:mini-state", handler);
    return () => ipcRenderer.removeListener("resonance:mini-state", handler);
  },
  sendMiniCommand: (cmd) => {
    ipcRenderer.send("resonance:mini-command", cmd);
  },
  onMiniCommand: (callback) => {
    const handler = (_event, cmd) => callback(cmd);
    ipcRenderer.on("resonance:mini-command", handler);
    return () => ipcRenderer.removeListener("resonance:mini-command", handler);
  },
  openMiniWindow: () => {
    ipcRenderer.send("resonance:mini-control", "open");
  },
  expandMainWindow: () => {
    ipcRenderer.send("resonance:mini-control", "expand");
  },
  isElectron: true,
});
