// Loads client/service-worker.js into a vm context with just enough of the
// ServiceWorkerGlobalScope to drive its fetch handler from node:test. The
// stubs mimic only what the worker actually touches on a Response — status,
// type, redirected, url, clone — so a test can hand it an SSO redirect or an
// offline rejection without a browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORIGIN = 'https://nodecal.test';

/** @param {{status?: number, type?: string, redirected?: boolean, url?: string, body?: string}} init */
function makeResponse(init = {}) {
  const status = init.status ?? 200;
  const res = {
    status,
    ok: status >= 200 && status < 300,
    type: init.type ?? 'basic',
    redirected: init.redirected ?? false,
    url: init.url ?? `${ORIGIN}/`,
    body: init.body ?? '',
  };
  res.clone = () => ({ ...res, clone: res.clone });
  return res;
}

/** The browser hands navigations a request with redirect:'manual'. */
function makeRequest(url, init = {}) {
  return {
    method: init.method ?? 'GET',
    url: url.startsWith('http') ? url : ORIGIN + url,
    mode: init.mode ?? 'no-cors',
    redirect: init.redirect ?? (init.mode === 'navigate' ? 'manual' : 'follow'),
  };
}

function cacheKey(request) {
  if (typeof request === 'string') return request;
  return request.url.startsWith(ORIGIN) ? request.url.slice(ORIGIN.length) : request.url;
}

function makeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) {
          return store.get(cacheKey(request)) ?? undefined;
        },
        async put(request, response) {
          store.set(cacheKey(request), response);
        },
        async addAll(requests) {
          for (const request of requests) store.set(cacheKey(request), makeResponse());
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

/**
 * @param {{ fetch: (request: any) => Promise<any>, assets?: string[] }} opts
 */
function loadWorker(opts) {
  const sources = [
    '../../client/sw/auth.js',
    '../../client/sw/dataCache.js',
    '../../client/sw/shell.js',
    '../../client/sw/notifications.js',
    '../../client/service-worker.js',
  ];
  const source = sources
    .map((relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8'))
    .map((moduleSource) =>
      moduleSource.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, ''),
    )
    .join('\n');
  const listeners = new Map();
  const posted = [];
  const caches = makeCaches();
  const precached = new Map();

  const self = {
    __WB_MANIFEST: opts.assets ?? [],
    location: { origin: ORIGIN },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    skipWaiting() {},
    registration: { showNotification() {} },
    clients: {
      async matchAll() {
        return [{ postMessage: (msg) => posted.push(msg) }];
      },
      async claim() {},
    },
  };

  const sandbox = {
    self,
    caches,
    clients: self.clients,
    fetch: (request) => opts.fetch(request),
    Request: function Request(url, init) {
      return makeRequest(url, init);
    },
    URL,
    setTimeout,
    console,
    precache() {},
    cleanupOutdatedCaches() {},
    async matchPrecache(request) {
      return precached.get(cacheKey(request));
    },
  };
  vm.runInNewContext(source, sandbox);

  return { listeners, posted, caches, precached, self };
}

/**
 * Dispatch a fetch event and resolve once the worker's response and every
 * waitUntil it registered have settled. `passedThrough` means the worker did
 * not call respondWith — the request goes straight to the browser.
 * @returns {Promise<{response: any, error: any, posted: string[], passedThrough: boolean}>}
 */
async function dispatchFetch(worker, request) {
  const waits = [];
  let responded;
  const event = {
    request,
    respondWith(promise) {
      responded = promise;
    },
    waitUntil(promise) {
      waits.push(promise);
    },
  };
  worker.listeners.get('fetch')(event);
  let response;
  let error;
  if (responded) {
    try {
      response = await responded;
    } catch (err) {
      error = err;
    }
  }
  await Promise.allSettled(waits);
  // Messages are built inside the vm, so they carry that realm's prototype and
  // would fail deepStrictEqual — compare the types the worker sent instead.
  const posted = worker.posted.map((msg) => msg.type);
  return { response, error, posted, passedThrough: !responded };
}

module.exports = { ORIGIN, loadWorker, dispatchFetch, makeRequest, makeResponse };
