const SHELL_CACHE = 'nodecal-shell-v3';
const DATA_CACHE  = 'nodecal-data-v3';

// All static files that make up the app shell
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/client/styles/main.css',
  '/client/styles/views.css',
  '/client/styles/month.css',
  '/client/app/main.js',
  '/client/app/state.js',
  '/client/app/utils.js',
  '/client/views/agenda.js',
  '/client/views/day.js',
  '/client/views/week.js',
  '/client/views/month.js',
  '/client/components/modalEditor.js',
  '/client/components/timeGrid.js',
  '/client/components/dnd.js',
  '/client/components/calendarDrawer.js',
  '/client/components/settingsPanel.js',
];

// API routes we cache for offline reading (normalised to pathname, no query params)
const DATA_PATHS = ['/events', '/calendars', '/settings', '/tasks'];

// ── Install: pre-cache the shell ─────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: drop stale caches ──────────────────────────
self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API data: network-first, fall back to last cached snapshot
  if (DATA_PATHS.includes(url.pathname)) {
    const normalised = new Request(url.pathname); // drop query params as cache key
    event.respondWith(
      fetch(request)
        .then(res => {
          // Clone synchronously before returning — once respondWith consumes
          // the body the clone() call would throw "body already used".
          const clone = res.ok ? res.clone() : null;
          if (clone) caches.open(DATA_CACHE).then(c => c.put(normalised, clone));
          return res;
        })
        .catch(() => caches.match(normalised))
    );
    return;
  }

  // API/auth endpoints that must never be cached — always hit the network
  if (['/sync', '/nlp', '/auth', '/login', '/logout', '/health', '/task-sources', '/weather'].some(p => url.pathname.startsWith(p))) return;

  // Shell assets: cache-first (updated on next install)
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(res => {
        const clone = res.ok ? res.clone() : null;
        if (clone) caches.open(SHELL_CACHE).then(c => c.put(request, clone));
        return res;
      }))
  );
});

// ── Notification click — focus/open the app ───────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(all => {
      for (const c of all) if ('focus' in c) return c.focus();
      return clients.openWindow('/');
    })
  );
});
