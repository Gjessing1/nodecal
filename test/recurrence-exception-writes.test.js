// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseIcs } = require('../server/caldav/parser');
const store = require('../server/cache/store');
const eventsRouter = require('../server/routes/events');

// The CalDAV server, stubbed at the fetch the client uses, so a PUT can be read
// back as the ICS body it would have sent. Editing one occurrence of a series
// is a rewrite of the whole resource, and what ends up in that body is the part
// worth pinning down.
const realFetch = globalThis.fetch;
/** @type {Array<{method: string, url: string, body: string}>} */
let requests = [];

function stubCaldav() {
  requests = [];
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
}

const SERIES = {
  uid: 'series-123',
  calendarId: '/cal1/',
  title: 'Standup',
  start: '2026-08-17T10:00:00.000Z',
  end: '2026-08-17T11:00:00.000Z',
  allDay: false,
  rrule: 'FREQ=WEEKLY;COUNT=8',
  exdates: null,
  href: 'http://localhost:5232/test/cal1/series-123.ics',
  etag: 'v1',
};

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use(eventsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = /** @type {any} */ (server.address());
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

/** The VEVENTs of the last resource written to the CalDAV stub. */
function lastPutVevents() {
  const put = [...requests].reverse().find((r) => r.method === 'PUT');
  assert.ok(put, 'no PUT reached the CalDAV stub');
  return parseIcs(put.body, { timezone: 'UTC' });
}

describe('editing one occurrence', () => {
  beforeEach(() => {
    store.clearEvents();
    store.setEventSilent(SERIES);
    stubCaldav();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.clearEvents();
  });

  it('writes a RECURRENCE-ID override into the series resource', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/events/series-123`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: 'series-123',
          recurringScope: 'single',
          occurrenceDate: '2026-08-24T10:00:00.000Z',
          title: 'Standup (moved)',
          start: '2026-08-26T09:00:00.000Z',
          end: '2026-08-26T10:00:00.000Z',
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.recurrenceId, '2026-08-24T10:00:00.000Z');
      assert.equal(body.uid, 'series-123');
      assert.equal(body.recurring, true);
    });

    // One resource, one UID — not a detached event under a fresh UID.
    assert.equal(requests.filter((r) => r.method === 'PUT').length, 1);
    const vevents = lastPutVevents();
    assert.equal(vevents.length, 2);
    const master = vevents.find((ev) => ev.rrule);
    const override = vevents.find((ev) => ev.recurrenceId);
    assert.equal(master.uid, 'series-123');
    assert.equal(override.uid, 'series-123');
    assert.equal(override.title, 'Standup (moved)');
    assert.equal(override.start, '2026-08-26T09:00:00.000Z');
    // The override suppresses the occurrence on its own; an EXDATE as well
    // would hide it from clients that honour EXDATE first.
    assert.equal(master.exdates, null);
    assert.equal(store.getOverrides().length, 1);
  });

  it('replaces an existing override instead of stacking a second one', async () => {
    store.setEventSilent({
      uid: 'series-123',
      calendarId: '/cal1/',
      title: 'Standup (moved)',
      start: '2026-08-26T09:00:00.000Z',
      end: '2026-08-26T10:00:00.000Z',
      allDay: false,
      rrule: null,
      recurrenceId: '2026-08-24T10:00:00.000Z',
      href: SERIES.href,
      etag: 'v1',
    });

    await withServer(async (base) => {
      const res = await fetch(`${base}/events/series-123`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: 'series-123',
          recurringScope: 'single',
          // What the views send for an override: occurrenceDate is its *moved*
          // start, and recurrenceId is the occurrence it stands in for.
          occurrenceDate: '2026-08-26T09:00:00.000Z',
          recurrenceId: '2026-08-24T10:00:00.000Z',
          title: 'Standup (room 2)',
          start: '2026-08-26T09:00:00.000Z',
          end: '2026-08-26T10:00:00.000Z',
        }),
      });
      assert.equal(res.status, 201);
    });

    const vevents = lastPutVevents();
    assert.equal(vevents.length, 2, 'the occurrence was written twice');
    const override = vevents.find((ev) => ev.recurrenceId);
    assert.equal(override.title, 'Standup (room 2)');
    assert.equal(store.getOverrides().length, 1);
  });
});

describe('deleting one occurrence', () => {
  beforeEach(() => {
    store.clearEvents();
    store.setEventSilent(SERIES);
    store.setEventSilent({
      uid: 'series-123',
      calendarId: '/cal1/',
      title: 'Standup (moved)',
      start: '2026-08-26T09:00:00.000Z',
      end: '2026-08-26T10:00:00.000Z',
      allDay: false,
      rrule: null,
      recurrenceId: '2026-08-24T10:00:00.000Z',
      href: SERIES.href,
      etag: 'v1',
    });
    stubCaldav();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.clearEvents();
  });

  it('drops the override as well as adding the EXDATE', async () => {
    await withServer(async (base) => {
      const url =
        `${base}/events/series-123?scope=single` +
        `&occurrenceDate=2026-08-26T09%3A00%3A00.000Z` +
        `&recurrenceId=2026-08-24T10%3A00%3A00.000Z`;
      const res = await fetch(url, { method: 'DELETE' });
      assert.equal(res.status, 204);
    });

    const vevents = lastPutVevents();
    // An EXDATE alone would leave the override standing, and the occurrence the
    // user just deleted would still be drawn at its edited time.
    assert.equal(vevents.length, 1);
    assert.deepEqual(vevents[0].exdates, ['20260824T100000Z']);
    assert.equal(store.getOverrides().length, 0);
  });

  it('takes the overrides with it when the whole series goes', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/events/series-123`, { method: 'DELETE' });
      assert.equal(res.status, 204);
    });
    assert.ok(requests.some((r) => r.method === 'DELETE'));
    // Removing the UID-keyed record alone used to leave the override behind,
    // pointing at a resource that no longer exists.
    assert.equal(store.getEventCount(), 0);
  });
});
