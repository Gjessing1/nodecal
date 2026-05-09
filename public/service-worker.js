const SHELL_CACHE = 'nodecal-shell-v1';
const DATA_CACHE  = 'nodecal-data-v1';

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
const DATA_PATHS = ['/events', '/calendars', '/settings'];

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
          if (res.ok) caches.open(DATA_CACHE).then(c => c.put(normalised, res.clone()));
          return res;
        })
        .catch(() => caches.match(normalised))
    );
    return;
  }

  // Mutating API endpoints — network only, no caching
  if (['/sync', '/nlp'].some(p => url.pathname.startsWith(p))) return;

  // Shell assets: cache-first (updated on next install)
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(res => {
        if (res.ok) caches.open(SHELL_CACHE).then(c => c.put(request, res.clone()));
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
