// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseIcs } = require('../server/caldav/vevent');
const store = require('../server/cache/store');
const eventsRouter = require('../server/routes/events');

// "This and following" starts a new series from the edited occurrence on. It
// is the old series' resource from there, not a bare event built from the
// editor's fields: other clients' lines, the later EXDATEs, RDATEs and
// overrides, and what COUNT has left all come along.
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

const HREF = 'http://localhost:5232/test/cal1/series-1.ics';
const ATTENDEE = 'ATTENDEE;CN=Kari;PARTSTAT=ACCEPTED:mailto:kari@example.com';

// Weekly from Mon 5 Oct, six times: 5, 12, 19, 26 Oct, 2 and 9 Nov. 2 Nov is
// skipped, 9 Nov was edited, and two extra dates fall on either side of 19 Oct.
function seed() {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Other//EN',
    'BEGIN:VEVENT',
    'UID:series-1',
    'SUMMARY:Standup',
    'DTSTART:20261005T100000Z',
    'DTEND:20261005T110000Z',
    'RRULE:FREQ=WEEKLY;COUNT=6',
    'EXDATE:20261102T100000Z',
    'RDATE:20261007T100000Z,20261028T100000Z',
    ATTENDEE,
    'X-OTHER-CLIENT:kept',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:series-1',
    'SUMMARY:Standup (late)',
    'RECURRENCE-ID:20261109T100000Z',
    'DTSTART:20261109T110000Z',
    'DTEND:20261109T120000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  for (const ev of parseIcs(ics, { timezone: 'UTC' })) {
    store.setEventSilent({ ...ev, calendarId: '/cal1/', href: HREF, etag: 'v1' });
  }
}

/**
 * PUT /events/series-1 the way the editor sends it.
 * @param {object} body
 */
async function edit(body) {
  const app = express();
  app.use(express.json());
  app.use(eventsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = /** @type {any} */ (server.address());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/events/series-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'series-1',
        calendarId: '/cal1/',
        title: 'Standup',
        allDay: false,
        rrule: 'FREQ=WEEKLY;COUNT=6',
        recurrenceId: null,
        ...body,
      }),
    });
    return res.status;
  } finally {
    server.close();
  }
}

/** @param {{body: string}} req */
function vevents(req) {
  return parseIcs(req.body, { timezone: 'UTC' });
}

/** @param {{body: string}} req */
function master(req) {
  return vevents(req).find((ev) => !ev.recurrenceId);
}

describe('this and following', () => {
  beforeEach(() => {
    store.clearEvents();
    seed();
    stubCaldav();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.clearEvents();
  });

  it('carries the series over when the time stays', async () => {
    const status = await edit({
      recurringScope: 'future',
      occurrenceDate: '2026-10-19T10:00:00.000Z',
      title: 'Retro',
      start: '2026-10-19T10:00:00.000Z',
      end: '2026-10-19T11:00:00.000Z',
    });
    assert.equal(status, 201);

    const [tailPut, headPut] = requests;
    assert.notEqual(tailPut.url, HREF, 'the new series was not written first');
    assert.equal(headPut.url, HREF);

    const tail = master(tailPut);
    assert.notEqual(tail.uid, 'series-1');
    assert.equal(tail.title, 'Retro');
    assert.equal(tail.start, '2026-10-19T10:00:00.000Z');
    assert.equal(tail.rrule, 'FREQ=WEEKLY;COUNT=4');
    assert.deepEqual(tail.exdates, ['20261102T100000Z']);
    assert.deepEqual(tail.rdates, ['20261028T100000Z']);
    assert.match(tailPut.body, /ATTENDEE;CN=Kari/);
    assert.match(tailPut.body, /X-OTHER-CLIENT:kept/);
    const moved = vevents(tailPut).filter((ev) => ev.recurrenceId);
    assert.equal(moved.length, 1, 'the edited 9 Nov was lost');
    assert.equal(moved[0].uid, tail.uid);
    assert.equal(moved[0].title, 'Standup (late)');

    const head = master(headPut);
    assert.equal(head.rrule, 'FREQ=WEEKLY;UNTIL=20261019T095959Z');
    assert.equal(head.exdates, null);
    assert.deepEqual(head.rdates, ['20261007T100000Z']);
    assert.equal(vevents(headPut).length, 1);

    assert.equal(store.getOverrides().length, 1);
    assert.equal(store.getOverrides()[0].uid, tail.uid);
  });

  it('starts without the old occurrences when the time moves', async () => {
    await edit({
      recurringScope: 'future',
      occurrenceDate: '2026-10-19T10:00:00.000Z',
      start: '2026-10-19T12:00:00.000Z',
      end: '2026-10-19T13:00:00.000Z',
    });

    const tail = master(requests[0]);
    assert.equal(tail.start, '2026-10-19T12:00:00.000Z');
    assert.equal(tail.rrule, 'FREQ=WEEKLY;COUNT=4');
    assert.equal(tail.exdates, null);
    assert.equal(tail.rdates, null);
    assert.equal(vevents(requests[0]).length, 1);
    assert.match(requests[0].body, /ATTENDEE;CN=Kari/);
  });

  it('takes the editor’s rule when it changed', async () => {
    await edit({
      recurringScope: 'future',
      occurrenceDate: '2026-10-19T10:00:00.000Z',
      rrule: 'FREQ=DAILY;COUNT=3',
      start: '2026-10-19T10:00:00.000Z',
      end: '2026-10-19T11:00:00.000Z',
    });

    const tail = master(requests[0]);
    assert.equal(tail.rrule, 'FREQ=DAILY;COUNT=3');
    assert.equal(tail.exdates, null);
    assert.equal(vevents(requests[0]).length, 1);
  });

  it('edits the whole series from its first occurrence', async () => {
    const status = await edit({
      recurringScope: 'future',
      occurrenceDate: '2026-10-05T10:00:00.000Z',
      title: 'Retro',
      start: '2026-10-05T10:00:00.000Z',
      end: '2026-10-05T11:00:00.000Z',
    });
    assert.equal(status, 200);
    assert.equal(requests.length, 1, 'an empty capped series was left behind');
    assert.equal(requests[0].url, HREF);
    assert.equal(master(requests[0]).title, 'Retro');
    assert.equal(vevents(requests[0]).length, 2);
  });
});

describe('editing every occurrence', () => {
  beforeEach(() => {
    store.clearEvents();
    seed();
    stubCaldav();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.clearEvents();
  });

  it('keeps RDATEs while the start stays', async () => {
    await edit({
      recurringScope: 'all',
      title: 'Retro',
      start: '2026-10-05T10:00:00.000Z',
      end: '2026-10-05T11:00:00.000Z',
    });
    assert.match(requests[0].body, /RDATE:20261007T100000Z,20261028T100000Z/);
  });

  it('drops RDATEs when the start moves', async () => {
    await edit({
      recurringScope: 'all',
      start: '2026-10-06T10:00:00.000Z',
      end: '2026-10-06T11:00:00.000Z',
    });
    assert.doesNotMatch(requests[0].body, /RDATE/);
    assert.equal(store.getEvent('series-1').rdates, null);
  });
});
