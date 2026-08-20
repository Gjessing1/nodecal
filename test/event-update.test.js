process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const store = require('../server/cache/store');
const eventsRouter = require('../server/routes/events');

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  store.clearEvents();
});

it('updates an imported event at its stored CalDAV href', async () => {
  const storedHref = 'http://localhost:5232/test/cal1/server-generated-name.ics';
  store.clearEvents();
  store.setEventSilent({
    uid: 'uid-does-not-match-resource-name',
    calendarId: '/cal1/',
    title: 'Original title',
    start: '2026-08-20T10:00:00.000Z',
    end: '2026-08-20T11:00:00.000Z',
    allDay: false,
    href: storedHref,
    etag: 'v1',
  });

  let caldavPutUrl = '';
  globalThis.fetch = /** @type {any} */ (
    async function stubbedFetch(url, options = {}) {
      if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
      caldavPutUrl = String(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"v2"' }),
        text: async () => '',
      };
    }
  );

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/uid-does-not-match-resource-name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Edited title' }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, 'Edited title');
  });

  assert.equal(caldavPutUrl, storedHref);
  assert.equal(store.getEvent('uid-does-not-match-resource-name').href, storedHref);
});

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api', eventsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
