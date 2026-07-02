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

  event.respondWith(shellCacheFirst(event, request));
});

async function networkFirstData(event, pathname, request) {
  const cacheKey = new Request(pathname);
  try {
    const res = await fetch(request);
    if (res.ok) {
      // Clone before returning; waitUntil keeps the worker alive until the
      // write lands, so a terminated worker can't drop the snapshot.
      const clone = res.clone();
      event.waitUntil(caches.open(DATA_CACHE).then((cache) => cache.put(cacheKey, clone)));
    }
    return res;
  } catch (err) {
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

// Cache-first, but only against this build's own cache — matching across all
// caches could serve another build's modules during the activation window and
// mix module versions on one page.
async function shellCacheFirst(event, request) {
  const shell = await caches.open(SHELL_CACHE);
  const cached = await shell.match(request);
  if (cached) return cached;

  // Offline navigation to any path falls back to the app shell.
  if (request.mode === 'navigate') {
    const home = await shell.match('/');
    if (home) return home;
  }

  const res = await fetch(request);
  if (res.ok) {
    const clone = res.clone();
    event.waitUntil(shell.put(request, clone));
  }
  return res;
}

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
