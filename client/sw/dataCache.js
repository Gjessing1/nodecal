// @ts-nocheck -- built for ServiceWorkerGlobalScope.
import {
  isAuthBounce,
  isCacheable,
  probeAuth,
  signalAuthRequired,
  signalFreshData,
  signalOfflineData,
} from './auth.js';

// Survives deploys on purpose; v2 = cache keys use /api/* pathnames.
const DATA_CACHE = 'nodecal-data-v2';

// Query parameters are deliberately removed from the cache key: offline mode
// always shows the last complete snapshot fetched for a resource.
export const DATA_PATHS = [
  '/api/events',
  '/api/calendars',
  '/api/settings',
  '/api/tasks',
  '/api/task-sources',
];

export async function networkFirstData(event, pathname, request) {
  const cacheKey = new Request(pathname);
  try {
    const res = await fetch(request);
    if (isAuthBounce(res)) {
      event.waitUntil(signalAuthRequired());
      return res;
    }
    if (isCacheable(res)) {
      const clone = res.clone();
      event.waitUntil(
        Promise.all([
          caches.open(DATA_CACHE).then((cache) => cache.put(cacheKey, clone)),
          signalFreshData(),
        ]),
      );
    }
    return res;
  } catch (error) {
    // Do not let an expired SSO session look like a working-but-stale calendar.
    event.waitUntil(probeAuth());
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(cacheKey);
    if (cached) {
      event.waitUntil(signalOfflineData());
      return cached;
    }
    throw error;
  }
}
