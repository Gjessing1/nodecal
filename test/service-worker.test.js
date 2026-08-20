// Regression tests for the service worker's behaviour behind an SSO proxy.
// An expired proxy session answers every request with a cross-origin redirect
// to the login host; the worker used to serve a cached shell over that, so the
// app painted and then died with no route back to the login form.
const test = require('node:test');
const assert = require('node:assert');
const {
  ORIGIN,
  loadWorker,
  dispatchFetch,
  makeRequest,
  makeResponse,
} = require('./helpers/sw-harness');

const LOGIN_HOST = 'https://auth.test/login';

function navRequest(path = '/') {
  return makeRequest(path, { mode: 'navigate' });
}

function scriptRequest(path) {
  return makeRequest(path, { mode: 'cors' });
}

/** What a navigation sees when the proxy bounces it: redirect:'manual' → opaqueredirect. */
function opaqueRedirect() {
  return makeResponse({ status: 0, type: 'opaqueredirect', url: '' });
}

async function seedShell(worker, path, body) {
  const cache = await worker.caches.open('nodecal-shell-testbuild');
  await cache.put(path, makeResponse({ body }));
}

test('navigation goes to the network even when the shell is cached', async () => {
  const worker = loadWorker({ fetch: async () => makeResponse({ body: 'FRESH' }) });
  await seedShell(worker, '/', 'CACHED');

  const { response } = await dispatchFetch(worker, navRequest());

  // Answering from cache here is what hid the proxy's login redirect.
  assert.strictEqual(response.body, 'FRESH');
});

test('navigation passes the proxy redirect through so the browser can follow it', async () => {
  const worker = loadWorker({ fetch: async () => opaqueRedirect() });
  await seedShell(worker, '/', 'CACHED');

  const { response } = await dispatchFetch(worker, navRequest());

  assert.strictEqual(response.type, 'opaqueredirect');
});

test('navigation falls back to the cached shell when offline', async () => {
  const worker = loadWorker({
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await seedShell(worker, '/', 'CACHED');

  const { response } = await dispatchFetch(worker, navRequest('/agenda'));

  assert.strictEqual(response.body, 'CACHED');
});

test('a bounced subresource asks the page to reload into the login flow', async () => {
  const worker = loadWorker({
    fetch: async (request) => {
      // The auth probe uses redirect:'manual' and so gets a response back;
      // the module fetch is CORS-mode and is rejected outright.
      if (request === '/api/auth/status' || request.url === '/api/auth/status') {
        return opaqueRedirect();
      }
      throw new TypeError('Failed to fetch');
    },
  });

  const { posted } = await dispatchFetch(worker, scriptRequest('/client/app/theme.js'));

  assert.deepStrictEqual(posted, ['AUTH_REQUIRED']);
});

test('being offline does not trigger a login reload', async () => {
  const worker = loadWorker({
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });

  const { posted } = await dispatchFetch(worker, scriptRequest('/client/app/theme.js'));

  assert.deepStrictEqual(posted, []);
});

test('event range queries share one last-known offline snapshot', async () => {
  let offline = false;
  const worker = loadWorker({
    fetch: async () => {
      if (offline) throw new TypeError('Failed to fetch');
      return makeResponse({ body: 'LATEST EVENTS' });
    },
  });

  await dispatchFetch(
    worker,
    makeRequest('/api/events?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z'),
  );
  offline = true;
  const { response, posted } = await dispatchFetch(
    worker,
    makeRequest('/api/events?from=2025-01-01T00:00:00.000Z&to=2027-12-31T00:00:00.000Z'),
  );

  assert.strictEqual(response.body, 'LATEST EVENTS');
  assert.deepStrictEqual(posted, ['FRESH_DATA', 'OFFLINE_DATA']);

  offline = false;
  const recovered = await dispatchFetch(worker, makeRequest('/api/events'));
  assert.deepStrictEqual(recovered.posted, ['FRESH_DATA', 'OFFLINE_DATA', 'FRESH_DATA']);
});

// A worker restart used to lose the "I am serving cached data" flag, which
// silenced FRESH_DATA for the rest of the session and left the page stuck in
// read-only mode with a working connection.
test('a restarted worker still signals fresh data after an outage', async () => {
  const options = {
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  };
  const offlineWorker = loadWorker(options);
  const cache = await offlineWorker.caches.open('nodecal-data-v2');
  await cache.put('/api/events', makeResponse({ body: 'SNAPSHOT' }));
  const { posted } = await dispatchFetch(offlineWorker, makeRequest('/api/events'));
  assert.deepStrictEqual(posted, ['OFFLINE_DATA']);

  // The browser discards an idle worker; the next request starts a fresh one.
  const restarted = loadWorker({ fetch: async () => makeResponse({ body: 'EVENTS' }) });
  const recovered = await dispatchFetch(restarted, makeRequest('/api/events'));
  assert.deepStrictEqual(recovered.posted, ['FRESH_DATA']);
});

test('a redirected response is never written to the shell cache', async () => {
  const worker = loadWorker({
    fetch: async () => makeResponse({ redirected: true, type: 'cors', url: LOGIN_HOST }),
  });

  await dispatchFetch(worker, scriptRequest('/client/app/theme.js'));

  const cache = await worker.caches.open('nodecal-shell-testbuild');
  assert.strictEqual(await cache.match('/client/app/theme.js'), undefined);
});

test('a 401 on an API read signals auth instead of caching the error', async () => {
  const worker = loadWorker({ fetch: async () => makeResponse({ status: 401 }) });

  const { posted } = await dispatchFetch(worker, makeRequest('/api/events'));

  assert.deepStrictEqual(posted, ['AUTH_REQUIRED']);
  const cache = await worker.caches.open('nodecal-data-v2');
  assert.strictEqual(await cache.match('/api/events'), undefined);
});

test('an offline API read still serves the last cached snapshot', async () => {
  const worker = loadWorker({
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const cache = await worker.caches.open('nodecal-data-v2');
  await cache.put('/api/events', makeResponse({ body: 'SNAPSHOT' }));

  const { response, posted } = await dispatchFetch(worker, makeRequest('/api/events'));

  assert.strictEqual(response.body, 'SNAPSHOT');
  assert.deepStrictEqual(posted, ['OFFLINE_DATA']);
});

test('cross-origin and legacy-root requests are left to the browser', async () => {
  const worker = loadWorker({ fetch: async () => makeResponse() });

  const external = await dispatchFetch(worker, makeRequest('https://elsewhere.test/x.js'));
  const legacy = await dispatchFetch(worker, makeRequest(`${ORIGIN}/events`));

  assert.strictEqual(external.passedThrough, true);
  assert.strictEqual(legacy.passedThrough, true);
});
