// @ts-nocheck -- built for ServiceWorkerGlobalScope.
const AUTH_PROBE_PATH = '/api/auth/status';
const AUTH_SIGNAL_GAP_MS = 30 * 1000;
let lastAuthSignal = 0;

export function isAuthBounce(res) {
  if (res.type === 'opaqueredirect') return true;
  if (res.status === 401 || res.status === 403) return true;
  return res.redirected && new URL(res.url).origin !== self.location.origin;
}

// Only a plain same-origin response is the file it claims to be. A redirected
// or opaque one must never be replayed from the API snapshot cache.
export function isCacheable(res) {
  return res.ok && res.type === 'basic' && !res.redirected;
}

// A rejected fetch means either "offline" or "bounced to the login host".
// A manual probe turns the latter into an opaqueredirect response so the page
// can navigate at top level, the only place an SSO redirect is allowed.
export async function probeAuth() {
  try {
    const res = await fetch(AUTH_PROBE_PATH, { redirect: 'manual', cache: 'no-store' });
    if (!isAuthBounce(res)) return;
  } catch {
    return;
  }
  await signalAuthRequired();
}

export async function signalAuthRequired() {
  if (Date.now() - lastAuthSignal < AUTH_SIGNAL_GAP_MS) return;
  lastAuthSignal = Date.now();
  await postToWindows('AUTH_REQUIRED');
}

export function signalOfflineData() {
  return postToWindows('OFFLINE_DATA');
}

// Sent on every live data read: an idle worker may be discarded between an
// outage and recovery, so worker memory cannot reliably remember offline mode.
export function signalFreshData() {
  return postToWindows('FRESH_DATA');
}

async function postToWindows(type) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type });
}
