// Recovery from an expired upstream SSO session.
//
// When Nodecal runs behind an auth proxy (BYPASS_AUTH=true), an expired proxy
// session turns every request into a cross-origin redirect to the login host.
// The service worker detects that but cannot act on it: only a top-level
// navigation is allowed to follow such a redirect. So the worker posts
// AUTH_REQUIRED and the page reloads — that navigation goes to the network
// (see shellNavigation in client/service-worker.js) and lands on the login form.

const RELOAD_GUARD_KEY = 'nc-auth-reload';
// A reload that comes back still unauthenticated would ask again, so bounce at
// most once per window instead of looping.
const RELOAD_GAP_MS = 30 * 1000;

export function initAuthReload() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', handleMessage);
}

function handleMessage(event) {
  if (!event.data || event.data.type !== 'AUTH_REQUIRED') return;
  if (recentlyReloaded()) return;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* private mode — the reload still helps, it just isn't guarded */
  }
  window.location.reload();
}

function recentlyReloaded() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    return Date.now() - last < RELOAD_GAP_MS;
  } catch {
    return false;
  }
}
