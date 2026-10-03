// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseIcs } = require('../server/caldav/vevent');
const { expandRecurring } = require('../server/caldav/recurrence');
const store = require('../server/cache/store');
const batchShiftRouter = require('../server/routes/eventBatchShift');

// A series and its edited occurrences are one CalDAV resource, so shifting it
// is one PUT of every VEVENT in it, each moved together. Europe/Oslo leaves
// summer time on 25 Oct 2026.
const realFetch = globalThis.fetch;
/** @type {Array<{method: string, url: string, body: string}>} */
let requests = [];
/** @type {(req: {method: string, url: string}) => boolean} */
let refuse = () => false;

function stubCaldav() {
  requests = [];
  refuse = () => false;
  globalThis.fetch = /** @type {any} */ (
    async function stubbedFetch(url, opts = {}) {
      const u = String(url);
      if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
      const req = { method: opts.method, url: u, body: String(opts.body || '') };
      requests.push(req);
      const ok = !refuse(req);
      return {
        ok,
        status: ok ? 200 : 500,
        headers: new Headers({ etag: '"v2"' }),
        text: async () => '',
      };
    }
  );
}

const HREF = 'http://localhost:5232/test/cal1/series-1.ics';

/** Seed the store with every VEVENT of one resource. */
function seed(vevents) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Other//EN',
    ...vevents,
    'END:VCALENDAR',
  ];
  for (const ev of parseIcs(ics.join('\r\n'), { timezone: 'UTC' })) {
    store.setEventSilent({ ...ev, calendarId: '/cal1/', href: HREF, etag: 'v1' });
  }
}

async function shift(body) {
  const app = express();
  app.use(express.json());
  app.use(batchShiftRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = /** @type {any} */ (server.address());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/events/batch-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } finally {
    server.close();
  }
}

function puts() {
  return requests.filter((r) => r.method === 'PUT');
}

/** @param {{body: string}} req */
function vevents(req) {
  return parseIcs(req.body, { timezone: 'UTC' });
}

/** @param {Array<{start: string}>} occurrences */
function starts(occurrences) {
  return occurrences.map((occ) => occ.start);
}

const FROM = new Date('2026-08-01T00:00:00Z');
const TO = new Date('2026-12-31T00:00:00Z');

describe('batch shift', () => {
  beforeEach(() => {
    store.clearEvents();
    stubCaldav();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.clearEvents();
  });

  it('moves a series with its EXDATEs, UNTIL and overrides in one PUT', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      'CATEGORIES:work',
      'DTSTART:20260817T100000Z',
      'DTEND:20260817T110000Z',
      'RRULE:FREQ=WEEKLY;UNTIL=20261005T100000Z',
      'EXDATE:20260831T100000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup (moved)',
      'RECURRENCE-ID:20260824T100000Z',
      'DTSTART:20260825T090000Z',
      'DTEND:20260825T100000Z',
      'END:VEVENT',
    ]);

    const result = await shift({ category: 'Work', shiftDays: 7 });
    assert.equal(result.shifted, 1);
    assert.equal(result.total, 1, 'the override was counted as an event of its own');

    assert.equal(puts().length, 1);
    assert.equal(puts()[0].url, HREF);
    const written = vevents(puts()[0]);
    assert.equal(written.length, 2, 'the override was dropped from the resource');
    const master = written.find((ev) => ev.rrule);
    const override = written.find((ev) => ev.recurrenceId);
    assert.equal(master.start, '2026-08-24T10:00:00.000Z');
    assert.equal(master.rrule, 'FREQ=WEEKLY;UNTIL=20261012T100000Z');
    assert.deepEqual(master.exdates, ['20260907T100000Z']);
    assert.equal(override.recurrenceId, '2026-08-31T10:00:00.000Z');
    assert.equal(override.start, '2026-09-01T09:00:00.000Z');
    assert.equal(override.title, 'Standup (moved)');

    assert.equal(store.getOverrides().length, 1);
    assert.equal(store.getEvent('series-1').start, '2026-08-24T10:00:00.000Z');
  });

  it('splits a zoned series at the anchor and keeps wall time across DST', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      'CATEGORIES:work',
      'DTSTART;TZID=Europe/Oslo:20261005T100000',
      'DTEND;TZID=Europe/Oslo:20261005T103000',
      'RRULE:FREQ=WEEKLY;COUNT=6',
      'EXDATE;TZID=Europe/Oslo:20261012T100000',
      'X-OTHER-CLIENT:kept',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup (early one)',
      'RECURRENCE-ID;TZID=Europe/Oslo:20261005T100000',
      'DTSTART;TZID=Europe/Oslo:20261005T110000',
      'DTEND;TZID=Europe/Oslo:20261005T113000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup (late one)',
      'RECURRENCE-ID;TZID=Europe/Oslo:20261026T100000',
      'DTSTART;TZID=Europe/Oslo:20261026T120000',
      'DTEND;TZID=Europe/Oslo:20261026T123000',
      'END:VEVENT',
    ]);

    const result = await shift({
      category: 'work',
      shiftDays: 7,
      anchorDate: '2026-10-18T00:00:00.000Z',
    });
    assert.equal(result.shifted, 1);
    assert.deepEqual(result.errors, []);

    // The new series is created before the old one is capped.
    const [tailPut, headPut] = puts();
    assert.notEqual(tailPut.url, HREF);
    assert.equal(headPut.url, HREF);

    const tail = vevents(tailPut);
    const tailMaster = tail.find((ev) => ev.rrule);
    assert.notEqual(tailMaster.uid, 'series-1');
    assert.equal(tailMaster.rrule, 'FREQ=WEEKLY;COUNT=4');
    assert.match(tailPut.body, /DTSTART;TZID=Europe\/Oslo:20261026T100000/);
    assert.match(tailPut.body, /X-OTHER-CLIENT:kept/);
    assert.deepEqual(starts(expandRecurring(tailMaster, FROM, TO)), [
      '2026-10-26T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      '2026-11-09T09:00:00.000Z',
      '2026-11-16T09:00:00.000Z',
    ]);
    const tailOverrides = tail.filter((ev) => ev.recurrenceId);
    assert.equal(tailOverrides.length, 1);
    assert.equal(tailOverrides[0].uid, tailMaster.uid);
    assert.equal(tailOverrides[0].recurrenceId, '2026-11-02T09:00:00.000Z');
    assert.equal(tailOverrides[0].start, '2026-11-02T11:00:00.000Z');

    const head = vevents(headPut);
    const headMaster = head.find((ev) => ev.rrule);
    assert.equal(headMaster.rrule, 'FREQ=WEEKLY;UNTIL=20261019T075959Z');
    assert.deepEqual(starts(expandRecurring(headMaster, FROM, TO)), ['2026-10-05T08:00:00.000Z']);
    const headOverrides = head.filter((ev) => ev.recurrenceId);
    assert.equal(headOverrides.length, 1);
    assert.equal(headOverrides[0].title, 'Standup (early one)');

    assert.equal(store.getOverrides().length, 2);
  });

  it('moves RDATEs with the series on its wall clock', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      'CATEGORIES:work',
      'DTSTART;TZID=Europe/Oslo:20261005T100000',
      'DTEND;TZID=Europe/Oslo:20261005T103000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'RDATE;TZID=Europe/Oslo:20261021T100000',
      'RDATE;VALUE=PERIOD:20261020T080000Z/20261020T100000Z,20261022T080000Z/PT1H',
      'END:VEVENT',
    ]);

    await shift({ category: 'work', shiftDays: 7 });
    const [master] = vevents(puts()[0]);
    // 21 Oct 10:00 summer time, a week on is 28 Oct 10:00 winter time.
    assert.deepEqual(master.rdates, [
      '20261028T090000Z',
      '20261027T090000Z/20261027T110000Z',
      '20261029T090000Z/PT1H',
    ]);
    assert.match(puts()[0].body, /RDATE;VALUE=PERIOD:20261027T090000Z\/20261027T110000Z/);
  });

  it('splits RDATEs at the anchor, moving only the later ones', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      'CATEGORIES:work',
      'DTSTART;TZID=Europe/Oslo:20261005T100000',
      'DTEND;TZID=Europe/Oslo:20261005T103000',
      'RRULE:FREQ=WEEKLY;COUNT=6',
      'RDATE;TZID=Europe/Oslo:20261007T100000,20261021T100000',
      'END:VEVENT',
    ]);

    await shift({ category: 'work', shiftDays: 7, anchorDate: '2026-10-18T00:00:00.000Z' });
    const [tailPut, headPut] = puts();
    assert.deepEqual(vevents(tailPut)[0].rdates, ['20261028T090000Z']);
    assert.deepEqual(vevents(headPut)[0].rdates, ['20261007T100000']);
    assert.match(headPut.body, /RDATE;TZID=Europe\/Oslo:20261007T100000\r\n/);
  });

  it('never writes an override on its own', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      'DTSTART:20260817T100000Z',
      'DTEND:20260817T110000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup (tagged)',
      'CATEGORIES:work',
      'RECURRENCE-ID:20260824T100000Z',
      'DTSTART:20260825T090000Z',
      'DTEND:20260825T100000Z',
      'END:VEVENT',
    ]);

    const result = await shift({ category: 'work', shiftDays: 7 });
    assert.equal(result.total, 0);
    assert.equal(puts().length, 0);
  });

  it('leaves the series whole when capping it fails', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      'CATEGORIES:work',
      'DTSTART:20260817T100000Z',
      'DTEND:20260817T110000Z',
      'RRULE:FREQ=WEEKLY;COUNT=8',
      'END:VEVENT',
    ]);
    refuse = function refuseSeriesHref(req) {
      return req.method === 'PUT' && req.url === HREF;
    };

    const result = await shift({
      category: 'work',
      shiftDays: 7,
      anchorDate: '2026-09-01T00:00:00.000Z',
    });
    assert.equal(result.shifted, 0);
    assert.equal(result.errors.length, 1);

    const created = puts()[0];
    const deleted = requests.find((r) => r.method === 'DELETE');
    assert.ok(deleted, 'the shifted copy was not rolled back');
    assert.equal(deleted.url, created.url);
    assert.equal(store.getAllEvents().length, 1);
    assert.equal(store.getEvent('series-1').rrule, 'FREQ=WEEKLY;COUNT=8');
  });

  it('only moves standalone events from the anchor on', async () => {
    seed([
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Review',
      'CATEGORIES:work',
      'DTSTART:20260817T100000Z',
      'DTEND:20260817T110000Z',
      'END:VEVENT',
    ]);

    const before = await shift({
      category: 'work',
      shiftDays: 2,
      anchorDate: '2026-09-01T00:00:00.000Z',
    });
    assert.equal(before.skipped, 1);
    assert.equal(puts().length, 0);

    const after = await shift({
      category: 'work',
      shiftDays: 2,
      anchorDate: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(after.shifted, 1);
    assert.equal(vevents(puts()[0])[0].start, '2026-08-19T10:00:00.000Z');
  });
});
