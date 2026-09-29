process.env.CALDAV_BASEURL = process.env.CALDAV_BASEURL || 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = process.env.CALDAV_USERNAME || 'test';
process.env.CALDAV_PASSWORD = process.env.CALDAV_PASSWORD || 'test';
process.env.CALDAV_TASKS_URL = 'http://localhost:5232/test/tasks/';
process.env.TIMEZONE = 'Europe/Oslo';

const { it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const store = require('../server/cache/store');
const { parseVtodo } = require('../server/caldav/vtodo');
const tasksRouter = require('../server/routes/tasks');

const TASK_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Other client//EN',
  'BEGIN:VTODO',
  'UID:route-task',
  'SUMMARY:Buy milk',
  'DUE:20260916T223000Z',
  'END:VTODO',
  'END:VCALENDAR',
].join('\r\n');

const realFetch = globalThis.fetch;
/** @type {string[]} */
let caldavPuts = [];

afterEach(() => {
  globalThis.fetch = realFetch;
  store.removeTaskSilent('route-task');
});

function stubCaldav() {
  caldavPuts = [];
  globalThis.fetch = /** @type {any} */ (
    async function stubbedFetch(url, options = {}) {
      if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, options);
      if (options.method === 'PUT') caldavPuts.push(String(options.body));
      return {
        ok: true,
        status: 201,
        headers: new Headers({ etag: '"v2"' }),
        text: async () => '',
      };
    }
  );
}

it('saves location and URL edits and returns them', async () => {
  const [task] = parseVtodo(TASK_ICS, { timezone: 'Europe/Oslo' });
  store.setTaskSilent({ ...task, href: 'http://localhost:5232/test/tasks/a.ics', etag: 'v1' });
  stubCaldav();

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks/route-task`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Kiwi', url: 'https://x.test/list' }),
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.location, 'Kiwi');
    assert.equal(saved.url, 'https://x.test/list');
    // Read in the configured zone, the UTC due time is on the 17th in Oslo.
    assert.equal(saved.due, '2026-09-17');
  });

  assert.equal(caldavPuts.length, 1);
  assert.match(caldavPuts[0], /\r\nLOCATION:Kiwi\r\n/);
  assert.match(caldavPuts[0], /\r\nURL:https:\/\/x\.test\/list\r\n/);
  assert.match(caldavPuts[0], /\r\nDUE:20260916T223000Z\r\n/, 'unchanged due kept as-is');
});

it('creates a task with a location and URL', async () => {
  stubCaldav();
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', location: 'Office', url: 'https://x.test/b' }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.location, 'Office');
    assert.equal(created.url, 'https://x.test/b');
    store.removeTaskSilent(created.uid);
  });
  assert.match(caldavPuts[0], /\r\nLOCATION:Office\r\n/);
  assert.match(caldavPuts[0], /\r\nURL:https:\/\/x\.test\/b\r\n/);
});

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api', tasksRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
