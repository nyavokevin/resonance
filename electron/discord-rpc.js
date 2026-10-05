// Resonance — Discord Rich Presence (main process only, CJS like main.js).
//
// NEVER required from the renderer: this module talks to the local Discord
// client over IPC via @xhayper/discord-rpc (fork supporting activity type 2
// Listening; same API shape as discord-rpc). Every failure is swallowed
// silently — Discord closed / missing clientId must never break the app.
//
// NOTE on the fork's API (differs from the original discord-rpc README):
//   const { Client } = require("@xhayper/discord-rpc");
//   const client = new Client({ clientId, transport: { type: "ipc" } });
//   await client.login(); // no args: plain IPC handshake, no OAuth needed
//   await client.user?.setActivity({ ... });
//   await client.user?.clearActivity();

const RETRY_MS = 30_000;

let clientId = null;
let client = null;
let connecting = false;
let ready = false;
let retryTimer = null;
/** Last activity received while offline — flushed on next ready. */
let pendingActivity = null;

function scheduleRetry() {
  if (retryTimer || !clientId) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    // Destroy + recreate on retry-after-fail: drop the dead client so the
    // next attempt starts from a fresh transport.
    if (client) {
      const dead = client;
      client = null;
      ready = false;
      Promise.resolve()
        .then(() => dead.destroy())
        .catch(() => {});
    }
    void connect();
  }, RETRY_MS);
  if (typeof retryTimer.unref === "function") retryTimer.unref();
}

async function connect() {
  // Guard against double-login.
  if (client || connecting || !clientId) return;
  connecting = true;
  try {
    const { Client } = require("@xhayper/discord-rpc");
    const c = new Client({ clientId, transport: { type: "ipc" } });
    c.on("ready", () => {
      ready = true;
      if (pendingActivity) {
        const activity = pendingActivity;
        pendingActivity = null;
        setActivity(activity);
      }
    });
    c.on("disconnected", () => {
      ready = false;
      scheduleRetry();
    });
    await c.login();
    client = c;
    ready = true;
  } catch {
    // Discord closed / no IPC pipe: silent retry in 30s.
    ready = false;
    scheduleRetry();
  } finally {
    connecting = false;
  }
  if (!client) scheduleRetry();
}

/** Init at startup. Skips everything silently when no clientId. */
function init(id) {
  if (!id) return;
  if (client || connecting) return;
  clientId = id;
  void connect();
}

function buildActivity({ title, artist, coverUrl, durationMs, positionMs, isPlaying }) {
  const now = Date.now();
  const safePos = Number.isFinite(positionMs) && positionMs > 0 ? Math.round(positionMs) : 0;
  const safeDur =
    Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0;
  const start = now - safePos;
  // Trim first: a whitespace-only string is truthy, so `||` alone would
  // let it through — and the fork drops blank `state` (`if
  // (activity.state)` in ClientUser.setActivity), leaving Discord with a
  // title but no artist line. `state` is the correct fork field (verified
  // against @xhayper/discord-rpc 1.5.1 SetActivity).
  const clean = (v) => (typeof v === "string" ? v.trim() : "");
  const safeTitle = (clean(title) || "Unknown title").slice(0, 128);
  const safeArtist = (clean(artist) || "Unknown artist").slice(0, 128);
  const activity = {
    // Listening (type 2) renders "Listening to Resonance" in Discord.
    type: 2,
    name: "Resonance",
    details: safeTitle,
    state: safeArtist,
    largeImageKey:
      typeof coverUrl === "string" && coverUrl.startsWith("https://") ? coverUrl : "logo",
    largeImageText: (clean(title) || "Resonance").slice(0, 128),
  };
  if (isPlaying && safeDur > 0) {
    activity.startTimestamp = start;
    activity.endTimestamp = start + safeDur;
  } else if (isPlaying) {
    activity.startTimestamp = start;
  } else {
    // Paused: frozen start, no end (no countdown while paused).
    activity.startTimestamp = start;
  }
  // Max 2 buttons — only when a site URL is configured.
  if (process.env.DISCORD_SITE_URL) {
    activity.buttons = [
      { label: "Écouter sur Resonance", url: process.env.DISCORD_SITE_URL },
    ];
  }
  return activity;
}

function setActivity(payload) {
  if (!clientId || !payload) return;
  if (!client) {
    // Offline: remember the latest activity for the next successful login.
    pendingActivity = payload;
    return;
  }
  try {
    const activity = buildActivity(payload);
    const p = client.user?.setActivity(activity);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* silent */
  }
}

function clearActivity() {
  pendingActivity = null;
  if (!clientId || !client) return;
  try {
    const p = client.user?.clearActivity();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* silent */
  }
}

function destroy() {
  pendingActivity = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (!client) return;
  const c = client;
  client = null;
  ready = false;
  try {
    const p = c.destroy();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* silent */
  }
}

module.exports = { init, setActivity, clearActivity, destroy };
