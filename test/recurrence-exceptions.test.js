// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs, serializeEvents } = require('../server/caldav/parser');
const {
  overrideAt,
  buildOverride,
  mergeOverride,
  withoutOverride,
  overridesBefore,
  withExdate,
} = require('../server/caldav/exceptions');

const BASE = {
  uid: 'series-123',
  calendarId: 'cal1',
  title: 'Standup',
  start: '2026-08-17T10:00:00.000Z',
  end: '2026-08-17T11:00:00.000Z',
  allDay: false,
  rrule: 'FREQ=WEEKLY;COUNT=8',
  exdates: null,
  href: 'http://cal/s.ics',
  etag: 'v1',
};

/** The 2026-08-24 occurrence, moved two days on and renamed. */
const MOVED = {
  uid: 'series-123',
  calendarId: 'cal1',
  title: 'Standup (moved)',
  start: '2026-08-26T09:00:00.000Z',
  end: '2026-08-26T10:00:00.000Z',
  allDay: false,
  rrule: null,
  recurrenceId: '2026-08-24T10:00:00.000Z',
};

describe('exception set operations', () => {
  it('finds the override replacing an occurrence, whatever form it was cached in', () => {
    const overrides = [MOVED, { ...MOVED, recurrenceId: '20260831T100000Z' }];
    assert.equal(overrideAt(overrides, '2026-08-24T10:00:00.000Z'), overrides[0]);
    // Legacy raw RECURRENCE-ID on one side, ISO on the other — same instant.
    assert.equal(overrideAt(overrides, '2026-08-31T10:00:00.000Z'), overrides[1]);
    assert.equal(overrideAt(overrides, '2026-09-07T10:00:00.000Z'), undefined);
  });

  it('builds an override without the series rule', () => {
    const ov = buildOverride(
      BASE,
      undefined,
      { title: 'Standup (moved)', start: '2026-08-26T09:00:00.000Z' },
      '2026-08-24T10:00:00.000Z',
    );
    assert.equal(ov.uid, BASE.uid);
    assert.equal(ov.recurrenceId, '2026-08-24T10:00:00.000Z');
    assert.equal(ov.title, 'Standup (moved)');
    // A copy of the RRULE here would expand into a second series.
    assert.equal(ov.rrule, null);
    assert.equal(ov.exdates, null);
  });

  it('edits an existing override in place rather than adding a second one', () => {
    const ov = buildOverride(BASE, MOVED, { title: 'Standup (room 2)' }, MOVED.recurrenceId);
    // Fields the user did not touch come from the override, not the master.
    assert.equal(ov.start, MOVED.start);
    assert.equal(ov.title, 'Standup (room 2)');
    const merged = mergeOverride([MOVED], ov);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, 'Standup (room 2)');
  });

  it('drops the override for a deleted occurrence', () => {
    assert.deepEqual(withoutOverride([MOVED], '2026-08-24T10:00:00.000Z'), []);
    assert.deepEqual(withoutOverride([MOVED], '2026-08-31T10:00:00.000Z'), [MOVED]);
  });

  it('keeps only the overrides a trimmed series still covers', () => {
    const later = { ...MOVED, recurrenceId: '2026-09-07T10:00:00.000Z' };
    const kept = overridesBefore([MOVED, later], '2026-08-31T10:00:00.000Z');
    assert.deepEqual(kept, [MOVED]);
  });

  it('adds an EXDATE once, in the right form for the event', () => {
    const skipped = withExdate(BASE, '2026-08-24T10:00:00.000Z');
    assert.deepEqual(skipped.exdates, ['20260824T100000Z']);
    // Deleting the same occurrence twice must not stack EXDATEs.
    assert.equal(withExdate(skipped, '2026-08-24T10:00:00.000Z'), skipped);
    const allDay = withExdate({ ...BASE, allDay: true }, '2026-08-24T00:00:00.000Z');
    assert.deepEqual(allDay.exdates, ['20260824']);
  });
});

describe('writing a series resource', () => {
  it('puts master and overrides in one VCALENDAR under one UID', () => {
    const ics = serializeEvents([BASE, MOVED]);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
    assert.equal((ics.match(/BEGIN:VCALENDAR/g) || []).length, 1);
    assert.equal((ics.match(/UID:series-123/g) || []).length, 2);
    assert.equal((ics.match(/RRULE:/g) || []).length, 1);
  });

  it('round-trips through the parser as a series plus an override', () => {
    const parsed = parseIcs(serializeEvents([BASE, MOVED]), { timezone: 'UTC' });
    assert.equal(parsed.length, 2);
    const master = parsed.find((ev) => ev.rrule);
    const override = parsed.find((ev) => ev.recurrenceId);
    assert.equal(master.uid, override.uid);
    assert.equal(override.recurrenceId, MOVED.recurrenceId);
    assert.equal(override.start, MOVED.start);
    assert.equal(override.title, 'Standup (moved)');
  });

  it('marks an all-day RECURRENCE-ID as a DATE value', () => {
    const allDayBase = { ...BASE, allDay: true, start: '2026-08-17T00:00:00.000Z' };
    const ics = serializeEvents([
      allDayBase,
      { ...MOVED, allDay: true, recurrenceId: '2026-08-24T00:00:00.000Z' },
    ]);
    assert.match(ics, /RECURRENCE-ID;VALUE=DATE:20260824/);
    // Without VALUE=DATE the parser reads it as a floating datetime and the
    // instant shifts by the configured zone's offset.
    const parsed = parseIcs(ics, { timezone: 'Europe/Oslo' });
    const override = parsed.find((ev) => ev.recurrenceId);
    assert.equal(override.recurrenceId, '2026-08-24T00:00:00.000Z');
  });
});

// ── GET /events over HTTP ─────────────────────────────────
// The route is mounted on a bare express app here: expanding a series does no
// CalDAV I/O, it only reads the store, so this exercises the real response
// shape the views consume.
const express = require('express');
const store = require('../server/cache/store');
const eventsRouter = require('../server/routes/events');

async function fetchEvents(from, to) {
  const app = express();
  app.use(eventsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = /** @type {any} */ (server.address());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/events?from=${from}&to=${to}`);
    return await res.json();
  } finally {
    server.close();
  }
}

describe('GET /events with a modified occurrence', () => {
  it('marks the override and leaves every other occurrence unmarked', async () => {
    store.clearEvents();
    store.setEventSilent(BASE);
    store.setEventSilent(MOVED);

    const events = await fetchEvents('2026-08-01T00:00:00Z', '2026-11-01T00:00:00Z');
    assert.equal(events.length, 8, 'the series lost or gained an occurrence');

    const marked = events.filter((ev) => ev.recurrenceId);
    assert.equal(marked.length, 1);
    assert.equal(marked[0].recurrenceId, '2026-08-24T10:00:00.000Z');
    assert.equal(marked[0].start, '2026-08-26T09:00:00.000Z');
    assert.equal(marked[0].title, 'Standup (moved)');
    assert.equal(marked[0].recurring, true);

    // The slot it was moved out of is gone, and nothing else claims to be edited.
    const starts = events.map((ev) => ev.start);
    assert.ok(!starts.includes('2026-08-24T10:00:00.000Z'));
    for (const ev of events) {
      if (ev === marked[0]) continue;
      assert.equal(ev.recurrenceId, null, `${ev.start} should not be marked`);
    }
    store.clearEvents();
  });
});
