// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs } = require('../server/caldav/parser');
const {
  indexOverrides,
  expandSeries,
  emitOverrides,
  recurrenceInstant,
} = require('../server/caldav/overrides');
const store = require('../server/cache/store');

// A weekly standup whose second Monday was moved to 14:00 by another
// CalDAV client. One resource, two VEVENTs, one UID.
const SERIES_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-123
DTSTART:20260817T100000Z
DTEND:20260817T110000Z
RRULE:FREQ=WEEKLY;COUNT=8
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:series-123
RECURRENCE-ID:20260824T100000Z
DTSTART:20260824T140000Z
DTEND:20260824T150000Z
SUMMARY:Standup (moved)
END:VEVENT
END:VCALENDAR`;

const FROM = new Date('2026-08-01T00:00:00Z');
const TO = new Date('2026-11-01T00:00:00Z');

describe('modified occurrences', () => {
  beforeEach(() => store.clearEvents());

  it('parses master and override as separate records sharing a uid', () => {
    const parsed = parseIcs(SERIES_ICS, { timezone: 'Europe/Oslo' });
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].uid, parsed[1].uid);
    assert.equal(parsed[0].rrule, 'FREQ=WEEKLY;COUNT=8');
    assert.equal(parsed[0].recurrenceId, null);
    assert.equal(parsed[1].rrule, null);
  });

  it('stores RECURRENCE-ID as an ISO UTC instant, not the raw ICS form', () => {
    const [, override] = parseIcs(SERIES_ICS, { timezone: 'Europe/Oslo' });
    assert.equal(override.recurrenceId, '2026-08-24T10:00:00.000Z');
    // serializeEvent writes it back through new Date() — the raw form was NaN.
    assert.ok(!Number.isNaN(new Date(override.recurrenceId).getTime()));
  });

  // The bug: keyed by uid alone, the override overwrote the master and the
  // whole series disappeared from the calendar.
  it('keeps the series alive when an override is stored beside it', () => {
    for (const ev of parseIcs(SERIES_ICS, { timezone: 'UTC' })) {
      store.setEventSilent({ ...ev, calendarId: 'cal1', href: 'http://cal/s.ics' });
    }
    assert.equal(store.getEventCount(), 2);
    assert.equal(store.getRecurringBases().length, 1);
    assert.equal(store.getOverrides().length, 1);
  });

  it('does not return an override as a standalone event', () => {
    for (const ev of parseIcs(SERIES_ICS, { timezone: 'UTC' })) {
      store.setEventSilent({ ...ev, calendarId: 'cal1', href: 'http://cal/s.ics' });
    }
    // Without the guard the override is emitted here *and* by emitOverrides.
    assert.deepEqual(store.getNonRecurringInRange(FROM, TO), []);
  });

  it('replaces the overridden occurrence rather than showing both', () => {
    const parsed = parseIcs(SERIES_ICS, { timezone: 'UTC' });
    const base = parsed.find((ev) => ev.rrule);
    const overrides = parsed.filter((ev) => ev.recurrenceId);
    const byUid = indexOverrides(overrides);

    const occurrences = expandSeries(base, byUid.get(base.uid), FROM, TO);
    const starts = occurrences.map((occ) => occ.start);
    assert.ok(!starts.includes('2026-08-24T10:00:00.000Z'), 'original slot still shown');

    const emitted = emitOverrides(overrides, FROM, TO);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].start, '2026-08-24T14:00:00.000Z');
    assert.equal(emitted[0].recurring, true);
    // Every other occurrence of the series survives.
    assert.equal(occurrences.length + emitted.length, 8);
  });

  it('matches the replaced occurrence even when moved to another day', () => {
    const parsed = parseIcs(
      SERIES_ICS.replace('DTSTART:20260824T140000Z', 'DTSTART:20260826T090000Z').replace(
        'DTEND:20260824T150000Z',
        'DTEND:20260826T100000Z',
      ),
      { timezone: 'UTC' },
    );
    const base = parsed.find((ev) => ev.rrule);
    const overrides = parsed.filter((ev) => ev.recurrenceId);
    const occurrences = expandSeries(base, indexOverrides(overrides).get(base.uid), FROM, TO);
    const starts = occurrences.map((occ) => occ.start);
    assert.ok(!starts.includes('2026-08-24T10:00:00.000Z'));
    assert.equal(occurrences.length, 7);
  });

  it('leaves an unmodified series untouched', () => {
    const [base] = parseIcs(SERIES_ICS, { timezone: 'UTC' });
    assert.equal(expandSeries(base, undefined, FROM, TO).length, 8);
  });

  it('reads a legacy raw RECURRENCE-ID from an older cache file', () => {
    assert.equal(recurrenceInstant('20260824T100000Z'), Date.UTC(2026, 7, 24, 10, 0, 0));
    assert.equal(recurrenceInstant('2026-08-24T10:00:00.000Z'), Date.UTC(2026, 7, 24, 10, 0, 0));
    assert.equal(recurrenceInstant('20260824'), Date.UTC(2026, 7, 24));
    assert.equal(recurrenceInstant(null), null);
    assert.equal(recurrenceInstant('nonsense'), null);
  });
});
