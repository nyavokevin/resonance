const { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, screen } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = 3000;
const isDev = process.env.ELECTRON_DEV === "1";
const projectRoot = path.join(__dirname, "..");

// Mini floating window (frameless, always on top).
const MINI_WIDTH = 320;
const MINI_HEIGHT = 160;

let win = null;
let miniWin = null;
let isQuitting = false;
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
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The main window owns audio playback: keep timers running when hidden
      // behind the mini floating window.
      backgroundThrottling: false,
    },
  });

  win.loadURL(`http://localhost:${PORT}`);
  win.on("closed", () => {
    win = null;
    // Closing the main window quits playback: take the mini window with it.
    if (miniWin && !miniWin.isDestroyed()) {
      isQuitting = true;
      miniWin.close();
    }
  });
  // Windows ignores setThumbarButtons before the taskbar button exists,
  // so set the buttons once the window is shown, not before.
  win.once("ready-to-show", () => {
    updateThumbar({ isPlaying: false, hasTrack: false, locale: "fr" });
  });
}

const THUMBAR_TOOLTIPS = {
  fr: { previous: "Précédent", play: "Lecture", pause: "Pause", next: "Suivant" },
  en: { previous: "Previous", play: "Play", pause: "Pause", next: "Next" },
};

/** Windows taskbar thumbnail buttons (shown on hover), like Spotify. */
let thumbarIconsLogged = false;

function updateThumbar({ isPlaying, hasTrack, locale }) {
  if (!win || process.platform !== "win32") return;
  try {
    const dir = path.join(__dirname, "thumbar");
    const tips = THUMBAR_TOOLTIPS[locale] || THUMBAR_TOOLTIPS.fr;
    // NOTE: no `flags` field at all when enabled — some Electron builds
    // render an explicit ["enabled"] array as disabled.
    const flags = hasTrack ? undefined : ["disabled"];
    const prevIcon = nativeImage.createFromPath(path.join(dir, "prev.png"));
    const playIcon = nativeImage.createFromPath(
      path.join(dir, isPlaying ? "pause.png" : "play.png")
    );
    const nextIcon = nativeImage.createFromPath(path.join(dir, "next.png"));
    if (!thumbarIconsLogged) {
      thumbarIconsLogged = true;
      for (const name of ["prev.png", "play.png", "pause.png", "next.png"]) {
        const img = nativeImage.createFromPath(path.join(dir, name));
        const size = img.getSize();
        console.log(
          `[thumbar] icon ${name}: empty=${img.isEmpty()} ${size.width}x${size.height}`
        );
      }
    }
    win.setThumbarButtons([
      {
        tooltip: tips.previous,
        icon: nativeImage.createFromPath(path.join(dir, "prev.png")),
        flags,
        click: () => {
          console.log("[thumbar] click: previous");
          win?.webContents.send("resonance:media-key", "previous");
        },
      },
      {
        tooltip: isPlaying ? tips.pause : tips.play,
        icon: nativeImage.createFromPath(
          path.join(dir, isPlaying ? "pause.png" : "play.png")
        ),
        flags,
        click: () => {
          console.log("[thumbar] click: toggle");
          win?.webContents.send("resonance:media-key", "toggle");
        },
      },
      {
        tooltip: tips.next,
        icon: nativeImage.createFromPath(path.join(dir, "next.png")),
        flags,
        click: () => {
          console.log("[thumbar] click: next");
          win?.webContents.send("resonance:media-key", "next");
        },
      },
    ]);
  } catch (err) {
    console.error("Thumbar error:", err);
  }
}

ipcMain.on("resonance:playback-state", (_event, state) => {
  console.log("[thumbar] playback-state:", JSON.stringify(state || {}));
  updateThumbar(state || {});
});

// ---- Mini floating window ---------------------------------------------

function miniBoundsPath() {
  return path.join(app.getPath("userData"), "mini-bounds.json");
}

function loadMiniBounds() {
  try {
    const { x, y } = JSON.parse(fs.readFileSync(miniBoundsPath(), "utf8"));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x: Math.round(x), y: Math.round(y) };
    }
  } catch {
    /* first run or corrupt file — fall back to default position */
  }
  return null;
}

function defaultMiniPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + area.width - MINI_WIDTH - 16),
    y: Math.round(area.y + area.height - MINI_HEIGHT - 16),
  };
}

function clampMiniPosition(pos) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.min(Math.max(pos.x, area.x), area.x + area.width - MINI_WIDTH),
    y: Math.min(Math.max(pos.y, area.y), area.y + area.height - MINI_HEIGHT),
  };
}

function createMiniWindow() {
  if (miniWin && !miniWin.isDestroyed()) return miniWin;
  const pos = clampMiniPosition(loadMiniBounds() ?? defaultMiniPosition());
  miniWin = new BrowserWindow({
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#1E1F22",
    title: "Resonance Mini",
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  miniWin.loadURL(`http://localhost:${PORT}/mini`);
  miniWin.on("moved", () => {
    try {
      const [x, y] = miniWin.getPosition();
      fs.writeFileSync(miniBoundsPath(), JSON.stringify({ x, y }));
    } catch {
      /* ignore persistence errors */
    }
  });
  // Never strand the user with no visible window: closing the mini
  // (e.g. Alt+F4) brings the main window back instead of quitting.
  miniWin.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      expandMain();
    }
  });
  miniWin.on("closed", () => (miniWin = null));
  return miniWin;
}

/** Hide the main window, show the floating mini (stays on top of every app). */
function openMini() {
  const mini = createMiniWindow();
  if (win && !win.isDestroyed()) win.hide();
  if (!mini.isVisible()) mini.show();
  else mini.focus();
}

/** Hide the mini, bring the main window back. */
function expandMain() {
  if (miniWin && !miniWin.isDestroyed() && miniWin.isVisible()) miniWin.hide();
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.focus();
  } else {
    createWindow();
  }
}

// Player snapshot relay: main renderer -> mini renderer (sender-checked).
ipcMain.on("resonance:mini-state", (event, state) => {
  if (win && event.sender === win.webContents) {
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.webContents.send("resonance:mini-state", state);
    }
  }
});

// Transport commands: mini renderer -> main renderer (sender-checked).
ipcMain.on("resonance:mini-command", (event, cmd) => {
  if (miniWin && event.sender === miniWin.webContents) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("resonance:mini-command", cmd);
    }
  }
});

// Window switching. Each action is only accepted from its own window.
ipcMain.on("resonance:mini-control", (event, action) => {
  if (action === "open" && win && event.sender === win.webContents) openMini();
  else if (action === "expand" && miniWin && event.sender === miniWin.webContents)
    expandMain();
});

function registerMediaKeys() {
  if (!win) return;
  const send = (action) => win?.webContents.send("resonance:media-key", action);
  globalShortcut.register("MediaPlayPause", () => send("toggle"));
  globalShortcut.register("MediaNextTrack", () => send("next"));
  globalShortcut.register("MediaPreviousTrack", () => send("previous"));
}

app.setAppUserModelId("app.resonance");

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
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (nextProc) nextProc.kill();
});

app.on("will-quit", () => {
  if (nextProc && !nextProc.killed) nextProc.kill();
});
