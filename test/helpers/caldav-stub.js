// Drives the events router against a stubbed CalDAV server: every request that
// is not to the test's own listener is recorded and answered 200 with a new
// etag, so a test reads back exactly the ICS a route wrote.
const express = require('express');

const realFetch = globalThis.fetch;

/**
 * Replace fetch for CalDAV requests.
 * @returns {Array<{method: string, url: string, body: string}>} filled as requests are made
 */
function stubCaldav() {
  /** @type {Array<{method: string, url: string, body: string}>} */
  const requests = [];
  globalThis.fetch = /** @type {any} */ (
    async function stubbedFetch(url, opts = {}) {
      const u = String(url);
      if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
      requests.push({ method: opts.method, url: u, body: String(opts.body || '') });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"v2"' }),
        text: async () => '',
      };
    }
  );
  return requests;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

/**
 * PUT /events/:id the way the editor sends it.
 * @param {string} id
 * @param {object} body
 * @returns {Promise<number>} the response status
 */
async function putEventRoute(id, body) {
  // Required here, not at the top: node --test also runs this file on its own,
  // without the env a test sets before config.js is loaded.
  const eventsRouter = require('../../server/routes/events');
  const app = express();
  app.use(express.json());
  app.use(eventsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = /** @type {any} */ (server.address());
  try {
    const res = await realFetch(`http://127.0.0.1:${port}/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.status;
  } finally {
    server.close();
  }
}

module.exports = { stubCaldav, restoreFetch, putEventRoute };
