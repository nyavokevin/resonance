// Resonance — Auto-update (processus main, packaged only).
//
// Écoute electron-updater (provider GitHub) et relaie l'état au renderer
// via "update:status". Tous les événements sont optionnels côté renderer :
// une erreur ne doit jamais casser l'app.
//
// En dev (electron . / ELECTRON_DEV) ou quand !app.isPackaged, tout est
// no-op : pas de serveur d'update local simulable, le code est skip.

const { app } = require("electron");
const log = require("electron-log");

// Fichier transport : logs dans le userData de l'app (OS natif).
log.transports.file.level = "info";

const CHECK_DELAY_MS = 3_000; // premier check après lancement
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // puis toutes les 4h
const MANUAL_TIMEOUT_MS = 25_000; // garde-fou : un check manuel sans réponse

let autoUpdater = null;
let notifyWindow = null; // WebContents de la fenêtre principale
let autoDownloadEnabled = true;
let timer = null;
let lastCheckManual = false; // pour n'envoyer "none"/"error" qu'au check manuel
let checkTimeout = null; // garde-fou du check manuel (jamais de spinner infini)

function send(event, payload = {}) {
  if (notifyWindow && !notifyWindow.isDestroyed()) {
    notifyWindow.send("update:status", { event, ...payload });
  }
}

function clearCheckTimeout() {
  if (checkTimeout) {
    clearTimeout(checkTimeout);
    checkTimeout = null;
  }
}

/** Arme le timeout 25s d'un check manuel (déclenche error{code:timeout}). */
function armCheckTimeout() {
  clearCheckTimeout();
  checkTimeout = setTimeout(() => {
    checkTimeout = null;
    lastCheckManual = false;
    send("error", { code: "timeout" });
  }, MANUAL_TIMEOUT_MS);
  if (typeof checkTimeout.unref === "function") checkTimeout.unref();
}

/** Un download en cours = activité : repousse l'expiration (pas terminal). */
function rearmCheckTimeout() {
  if (checkTimeout) armCheckTimeout();
}

/** Lazy require : electron-updater ne se charge qu'embarqué. */
function getUpdater() {
  if (autoUpdater) return autoUpdater;
  if (!app.isPackaged) return null;
  try {
    const { autoUpdater: updater } = require("electron-updater");
    updater.logger = log;
    updater.autoDownload = autoDownloadEnabled;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    autoUpdater = updater;
    return updater;
  } catch (err) {
    log.warn("[auto-update] electron-updater unavable:", err instanceof Error ? err.message : err);
    return null;
  }
}

function wireEvents() {
  const updater = getUpdater();
  if (!updater || updater.__resonanceWired) return;
  updater.__resonanceWired = true;

  updater.on("checking-for-update", () => {
    if (lastCheckManual) send("checking");
  });
  updater.on("update-available", (info) => {
    // autoDownload=true : le download suit immédiatement — on annonce comme
    // "available" puis "progress" arrivera.
    clearCheckTimeout();
    send("available", { version: info && info.version ? info.version : "" });
  });
  updater.on("update-not-available", () => {
    // Silencieux en auto : seul le check manuel confirme "à jour".
    clearCheckTimeout();
    if (lastCheckManual) send("none");
  });
  updater.on("download-progress", (p) => {
    // Activité : repousse le timeout 25s (un gros download dure plus longtemps).
    rearmCheckTimeout();
    const percent = typeof p === "object" && p ? Math.round(p.percent || 0) : 0;
    const mb = typeof p === "object" && p ? Math.round(p.transferred / (1024 * 1024)) : 0;
    send("progress", { percent, mb });
  });
  updater.on("update-downloaded", (info) => {
    clearCheckTimeout();
    send("downloaded", { version: info && info.version ? info.version : "" });
  });
  updater.on("error", (err) => {
    log.warn("[auto-update] error:", err);
    clearCheckTimeout();
    // En auto-check, inutile d'embêter l'utilisateur ; en check manuel on
    // relaie l'erreur au renderer.
    if (lastCheckManual) {
      send("error", { message: err && err.message ? err.message : String(err) });
    }
  });
}

/**
 * Démarre l'auto-update pour la fenêtre principale.
 * notifyWindow est posé INCONDITIONNELLEMENT (dev compris) : les
 * événements "update:status" ont toujours une cible — sinon le bouton
 * "Vérifier" resterait bloqué en dev (les messages seraient perdus).
 * Seuls les timers 3s/4h sont réservés au mode packagé (getUpdater null
 * en dev/non-packagé).
 */
function startAutoUpdate(win) {
  notifyWindow = win && win.webContents ? win.webContents : null;
  wireEvents();
  const updater = getUpdater();
  if (!updater) return;

  setTimeout(() => {
    void checkForUpdates(false);
  }, CHECK_DELAY_MS);
  timer = setInterval(() => {
    void checkForUpdates(false);
  }, CHECK_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

/**
 * Check manuel (bouton) ou automatique (timer). manual=true → les
 * événements none/error sont relayés au renderer.
 *
 * Dev / non-packagé (getUpdater → null) : un check MANUEL reçoit une
 * erreur terminale `code: "dev-not-available"` (jamais de spinner infini).
 * Un check manuel packagé arme un timeout 25s : sans événement terminal
 * (available/none/downloaded/error), `error { code: "timeout" }` est envoyé.
 */
async function checkForUpdates(manual) {
  clearCheckTimeout();
  const updater = getUpdater();
  if (!updater) {
    if (manual) {
      send("error", { code: "dev-not-available" });
    }
    return;
  }
  lastCheckManual = Boolean(manual);
  if (manual) armCheckTimeout();
  try {
    await updater.checkForUpdates();
  } catch (err) {
    log.warn("[auto-update] check failed:", err);
    // L'event "error" de la lib aura aussi parlé — on complète le cas
    // exception levée avant tout event.
    if (manual) {
      clearCheckTimeout();
      send("error", { message: err && err.message ? err.message : String(err) });
    }
  }
}

/** Active/désactive le téléchargement automatique (toggle réglages). */
function setAutoDownload(on) {
  autoDownloadEnabled = Boolean(on);
  if (autoUpdater) autoUpdater.autoDownload = autoDownloadEnabled;
}

module.exports = { startAutoUpdate, checkForUpdates, setAutoDownload };