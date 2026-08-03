// Served through server/app.js, which prepends `self.__BUILD__` (a content
// hash of every client-served file) and `self.__ASSETS__` (the full shell
// asset list, discovered by walking the served directories). A deploy that
// changes any client file therefore changes this script byte-for-byte, which
// is what triggers the browser's service-worker update flow — no manual
// version bumps, no reinstalling the PWA.
const BUILD = self.__BUILD__ || 'dev';
const SHELL_CACHE = 'nodecal-shell-' + BUILD;
// Survives deploys on purpose; v2 = cache keys moved to /api/* pathnames.
const DATA_CACHE = 'nodecal-data-v2';
const SHELL_ASSETS = self.__ASSETS__ || ['/'];

// API reads cached for offline use (cache key normalised to pathname, no query
// params — offline always shows the last fetched snapshot).
const DATA_PATHS = [
  '/api/events',
  '/api/calendars',
  '/api/settings',
  '/api/tasks',
  '/api/task-sources',
];

// Pre-/api root paths. A stale tab can briefly pair with this worker during
// the update handoff — pass its API calls straight to the network so JSON can
// never leak into the shell cache.
const LEGACY_API = [
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

// ── Install: precache the new shell into a build-versioned cache ──────────
// cache:'reload' bypasses the HTTP cache so the precache holds exactly what
// the server ships right now. No skipWaiting here: the new worker waits until
// every open page is ready to reload into it (swUpdate.js posts SKIP_WAITING),
// so a page never runs a mix of old and new modules.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(
          SHELL_ASSETS.map(
            (url) => new Request(url, { cache: 'reload', credentials: 'same-origin' }),
          ),
        ),
      ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Activate: drop caches from older builds, take over open pages ─────────
self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// ── SSO-gated deployments ─────────────────────────────────────────────────
// Nodecal is often fronted by an auth proxy (tinyauth, Authelia, …) with
// BYPASS_AUTH=true. Once that proxy's session expires it answers every request
// with a redirect to its login host. A subresource or API fetch can never
// follow that redirect — it is cross-origin, so CORS rejects it — which used to
// leave the app painting a cached shell whose modules then failed to load, with
// no way to sign back in. Only a top-level navigation may follow the redirect,
// so recovery is always: make the page navigate.
const AUTH_PROBE_PATH = '/api/auth/status';
const AUTH_SIGNAL_GAP_MS = 30 * 1000;
let lastAuthSignal = 0;

function isAuthBounce(res) {
  if (res.type === 'opaqueredirect') return true;
  if (res.status === 401 || res.status === 403) return true;
  return res.redirected && new URL(res.url).origin !== self.location.origin;
}

// Only a plain same-origin response is the file it claims to be. A redirected
// or opaque one would be replayed out of the cache as if it were the asset,
// which is how a login page ends up cached under /client/app/main.js.
function isCacheable(res) {
  return res.ok && res.type === 'basic' && !res.redirected;
}

// A rejected fetch means either "offline" or "bounced to the login host", and
// the rejection alone cannot tell them apart. redirect:'manual' turns a bounce
// into an opaqueredirect response instead of a rejection, so this probe can.
async function probeAuth() {
  try {
    const res = await fetch(AUTH_PROBE_PATH, { redirect: 'manual', cache: 'no-store' });
    if (!isAuthBounce(res)) return;
  } catch {
    return; // genuinely offline — the cached snapshot is the right answer
  }
  await signalAuthRequired();
}

async function signalAuthRequired() {
  if (Date.now() - lastAuthSignal < AUTH_SIGNAL_GAP_MS) return;
  lastAuthSignal = Date.now();
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: 'AUTH_REQUIRED' });
}

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Update checks must always reach the server, never a cached copy.
  if (url.pathname === '/service-worker.js') return;

  if (url.pathname.startsWith('/api/')) {
    if (DATA_PATHS.includes(url.pathname)) {
      event.respondWith(networkFirstData(event, url.pathname, request));
    }
    // Every other API endpoint always hits the network uncached.
    return;
  }

  if (LEGACY_API.some((p) => url.pathname.startsWith(p))) return;

  if (request.mode === 'navigate') {
    event.respondWith(shellNavigation(request));
    return;
  }

  event.respondWith(shellCacheFirst(event, request));
});

async function networkFirstData(event, pathname, request) {
  const cacheKey = new Request(pathname);
  try {
    const res = await fetch(request);
    if (isAuthBounce(res)) {
      event.waitUntil(signalAuthRequired());
      return res;
    }
    if (isCacheable(res)) {
      // Clone before returning; waitUntil keeps the worker alive until the
      // write lands, so a terminated worker can't drop the snapshot.
      const clone = res.clone();
      event.waitUntil(caches.open(DATA_CACHE).then((cache) => cache.put(cacheKey, clone)));
    }
    return res;
  } catch (err) {
    // Serving the stale snapshot behind an expired session would look like a
    // working calendar that silently stopped updating, so check before falling
    // back and send the page to the login page if that is what happened.
    event.waitUntil(probeAuth());
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

// Navigations go to the network first. The response may be the auth proxy's
// redirect to its login page, and passing that through is the only way the user
// can sign back in — answering from the cache instead is what stranded an
// expired session on a blank calendar. The timeout keeps a slow or dead
// connection from delaying launch: the cached shell answers, and a bounce is
// then caught on the first API call instead.
const NAV_NETWORK_TIMEOUT_MS = 2500;

function afterTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms, null));
}

async function shellNavigation(request) {
  let res;
  try {
    res = await Promise.race([fetch(request), afterTimeout(NAV_NETWORK_TIMEOUT_MS)]);
  } catch {
    // offline — fall through to the cached shell
  }
  if (res) return res;

  // Any path falls back to the app shell — index.html is the only document
  // this server serves.
  const shell = await caches.open(SHELL_CACHE);
  const home = await shell.match('/');
  if (home) return home;
  return fetch(request);
}

// Cache-first, but only against this build's own cache — matching across all
// caches could serve another build's modules during the activation window and
// mix module versions on one page.
async function shellCacheFirst(event, request) {
  const shell = await caches.open(SHELL_CACHE);
  const cached = await shell.match(request);
  if (cached) return cached;

  let res;
  try {
    res = await fetch(request);
  } catch (err) {
    // A module that misses the cache and then gets bounced cross-origin kills
    // the whole module graph, so the page has to reload into the login flow.
    event.waitUntil(probeAuth());
    throw err;
  }
  if (isAuthBounce(res)) {
    event.waitUntil(signalAuthRequired());
    return res;
  }
  if (isCacheable(res)) {
    const clone = res.clone();
    event.waitUntil(shell.put(request, clone));
  }
  return res;
}

// ── Web Push — server-sent reminders arrive with the app closed ────────────
// Payload shape mirrors server/push/scheduler.js: { title, body, tag }.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Nodecal', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Nodecal', {
      body: payload.body || '',
      icon: '/icons/icon.svg',
      tag: payload.tag || undefined,
    }),
  );
});

// ── Notification click — focus/open the app ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      for (const c of all) if ('focus' in c) return c.focus();
      return clients.openWindow('/');
    }),
  );
});
