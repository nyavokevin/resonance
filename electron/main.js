const { app, BrowserWindow, globalShortcut } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 3000;
const isDev = process.env.ELECTRON_DEV === "1";
const projectRoot = path.join(__dirname, "..");

let win = null;
let nextProc = null;

function startNextServer() {
  if (isDev) {
    const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
    nextProc = spawn(
      process.execPath,
      [nextBin, "dev", "-p", String(PORT)],
      {
        cwd: projectRoot,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "development" },
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      }
    );
  } else {
    const serverJs = path.join(projectRoot, ".next", "standalone", "server.js");
    nextProc = spawn(
      process.execPath,
      [serverJs],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NODE_ENV: "production",
          PORT: String(PORT),
          HOSTNAME: "localhost",
        },
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      }
    );
  }
  nextProc.on("error", (err) => console.error("Next server error:", err));
}

function waitForServer(retries = 120) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (left <= 0) reject(new Error("Next server unreachable"));
        else setTimeout(() => attempt(left - 1), 1000);
      });
    };
    attempt(retries);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#1E1F22",
    autoHideMenuBar: true,
    title: "Resonance",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://localhost:${PORT}`);
  win.on("closed", () => (win = null));
}

function registerMediaKeys() {
  if (!win) return;
  const send = (action) => win?.webContents.send("resonance:media-key", action);
  globalShortcut.register("MediaPlayPause", () => send("toggle"));
  globalShortcut.register("MediaNextTrack", () => send("next"));
  globalShortcut.register("MediaPreviousTrack", () => send("previous"));
}

app.whenReady().then(async () => {
  startNextServer();
  try {
    await waitForServer();
  } catch (err) {
    console.error(err);
    app.quit();
    return;
  }
  createWindow();
  registerMediaKeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (nextProc) nextProc.kill();
});

app.on("will-quit", () => {
  if (nextProc && !nextProc.killed) nextProc.kill();
});
