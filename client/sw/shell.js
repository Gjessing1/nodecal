// @ts-nocheck -- built for ServiceWorkerGlobalScope.
import { matchPrecache } from 'workbox-precaching';
import { isAuthBounce, probeAuth, signalAuthRequired } from './auth.js';

// A stale tab can briefly pair with this worker during the update handoff.
// Pre-/api calls must go straight to the network so JSON never leaks into the
// shell path.
export const LEGACY_API = [
  '/events',
  '/calendars',
  '/settings',
  '/tasks',
  '/task-sources',
  '/sync',
  '/nlp',
  '/auth',
  '/login',
  '/logout',
  '/health',
  '/weather',
];

const NAV_NETWORK_TIMEOUT_MS = 2500;

function afterTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms, null));
}

// Navigations go network-first so an upstream auth proxy can send the browser
// to its login host. A short timeout keeps offline home-screen launch fast.
export async function shellNavigation(request) {
  let res;
  try {
    res = await Promise.race([fetch(request), afterTimeout(NAV_NETWORK_TIMEOUT_MS)]);
  } catch {
    // Offline: fall through to Workbox's revisioned app shell.
  }
  if (res) return res;

  const home = await matchPrecache('/index.html');
  if (home) return home;
  return fetch(request);
}

// Anything outside Workbox's exact build manifest goes to the network and is
// never added to the shell cache behind Workbox's back.
export async function shellCacheFirst(event, request) {
  const cached = await matchPrecache(request);
  if (cached) return cached;

  let res;
  try {
    res = await fetch(request);
  } catch (error) {
    event.waitUntil(probeAuth());
    throw error;
  }
  if (isAuthBounce(res)) {
    event.waitUntil(signalAuthRequired());
  }
  return res;
}
