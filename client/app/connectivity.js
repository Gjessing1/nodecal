// Owns the answer to "are we actually offline?".
//
// Nothing else in the app is allowed to decide this, because every signal that
// used to decide it lies in one direction or the other:
//
//   - `navigator.onLine` reports the radio, not the server. A captive Wi-Fi, a
//     VPN, a dead container or a sleeping phone all read as *online*, so the
//     browser never fires the `online` event — which used to be the only way
//     back out of offline mode when it had been entered without a matching
//     `offline` event.
//   - The service worker's "am I serving the cached snapshot?" flag lives in
//     worker memory, and the browser discards a worker after ~30s idle. Its
//     FRESH_DATA signal therefore goes missing exactly when the connection
//     comes back, which stranded the app in read-only mode until a reload.
//
// So this module asks the server itself, on a retry loop, and keeps asking
// until it answers. /api/health is uncached by the service worker, so a
// successful probe always means a real round trip.

const PROBE_PATH = '/api/health';
const PROBE_TIMEOUT_MS = 4000;
const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 30 * 1000;

/** @type {() => boolean} */
let isOffline = () => false;
/** @type {(offline: boolean) => void} */
let setOffline = () => {};
/** @type {() => void} */
let onReconnect = () => {};

let retryTimer = null;
let retryDelay = RETRY_MIN_MS;
let probeInFlight = null;

// AbortSignal.timeout is missing on older WebViews; a dead connection must not
// leave the probe hanging forever, so fall back to an AbortController.
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// A cross-origin bounce to an SSO login host rejects under CORS, which reads
// here as "unreachable" — the service worker's AUTH_REQUIRED path handles that
// case and reloads the page into the login flow.
async function reachServer() {
  try {
    const res = await fetch(PROBE_PATH, {
      cache: 'no-store',
      signal: timeoutSignal(PROBE_TIMEOUT_MS),
    });
    return res.ok && !res.redirected;
  } catch {
    return false;
  }
}

/** Single-flight so a burst of signals can't fan out into a burst of probes. */
export function probeServer() {
  if (probeInFlight) return probeInFlight;
  probeInFlight = reachServer().finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

function stopRetries() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = RETRY_MIN_MS;
}

// Backs off to RETRY_MAX_MS so a long outage costs a probe every 30s, and
// pauses entirely while the app is in the background — a hidden tab has
// nothing to show and the visibility handler probes the moment it returns.
function scheduleRetry() {
  if (retryTimer || !isOffline()) return;
  if (document.visibilityState !== 'visible') return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    await recheck();
  }, retryDelay);
}

/** Probe now; leave offline mode the moment the server answers. */
export async function recheck() {
  if (!isOffline()) return true;
  const online = await probeServer();
  if (!online) {
    scheduleRetry();
    return false;
  }
  stopRetries();
  setOffline(false);
  onReconnect();
  return true;
}

function enterOffline() {
  stopRetries();
  setOffline(true);
  scheduleRetry();
}

/**
 * The worker fell back to the cached snapshot. When the radio is already down
 * that is conclusive; when it claims to be up the read may just have been a
 * hiccup, so confirm before flipping the whole app read-only and closing the
 * user's open editor over a single timed-out request.
 */
export function reportOfflineData() {
  if (isOffline()) {
    scheduleRetry();
    return;
  }
  if (!navigator.onLine) {
    enterOffline();
    return;
  }
  probeServer().then((online) => {
    if (online) onReconnect();
    else enterOffline();
  });
}

/** The worker served a live response — the server is demonstrably reachable. */
export function reportFreshData() {
  if (!isOffline()) return;
  stopRetries();
  setOffline(false);
}

/**
 * @param {{ isOffline: () => boolean, setOffline: (offline: boolean) => void,
 *           onReconnect: () => void }} opts
 */
export function initConnectivity(opts) {
  isOffline = opts.isOffline;
  setOffline = opts.setOffline;
  onReconnect = opts.onReconnect;

  window.addEventListener('offline', enterOffline);
  // `online` means the radio is back, not that the server is — so probe rather
  // than trust it, and keep retrying if it turns out to be a lie.
  window.addEventListener('online', () => {
    retryDelay = RETRY_MIN_MS;
    recheck();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      stopRetries();
      return;
    }
    retryDelay = RETRY_MIN_MS;
    recheck();
  });

  if (navigator.onLine) setOffline(false);
  else enterOffline();
}
