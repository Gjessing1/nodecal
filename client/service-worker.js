// @ts-nocheck -- this module is built for ServiceWorkerGlobalScope, while the
// rest of client/ is checked against the browser DOM library.
import { cleanupOutdatedCaches, precache } from 'workbox-precaching';
import { DATA_PATHS, networkFirstData } from './sw/dataCache.js';
import { registerNotificationHandlers } from './sw/notifications.js';
import { LEGACY_API, shellCacheFirst, shellNavigation } from './sw/shell.js';

// Vite injects a content-revisioned entry for every built shell asset. Workbox
// owns installation and old-revision cleanup; Nodecal supplies the specialized
// runtime behavior below.
precache(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// No skipWaiting at install: every open page opts in through swUpdate.js, so a
// running page never swaps to a different asset graph underneath itself.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Workbox removes stale revisions. Remove the legacy pre-Vite shell caches
// once, preserve the data snapshot, and take over the tabs that opted in.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('nodecal-shell-')).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (DATA_PATHS.includes(url.pathname)) {
      event.respondWith(networkFirstData(event, url.pathname, request));
    }
    return;
  }

  if (LEGACY_API.some((path) => url.pathname.startsWith(path))) return;
  if (request.mode === 'navigate') {
    event.respondWith(shellNavigation(request));
    return;
  }

  event.respondWith(shellCacheFirst(event, request));
});

registerNotificationHandlers();
