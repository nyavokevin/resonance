const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resonance", {
  onMediaKey: (callback) => {
    ipcRenderer.on("resonance:media-key", (_event, action) => callback(action));
  },
  isElectron: true,
});
