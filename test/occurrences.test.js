process.env.CALDAV_BASEURL = process.env.CALDAV_BASEURL || 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = process.env.CALDAV_USERNAME || 'test';
process.env.CALDAV_PASSWORD = process.env.CALDAV_PASSWORD || 'test';

const { it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs } = require('../server/caldav/vevent');
const { occurrencesInRange } = require('../server/caldav/occurrences');
const store = require('../server/cache/store');

// A weekly standup with its second occurrence moved, a cancelled one-off and a
// plain one-off: every kind of record GET /events and the Glance agenda share.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-1
DTSTART:20260817T100000Z
DTEND:20260817T110000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:series-1
RECURRENCE-ID:20260824T100000Z
DTSTART:20260824T140000Z
DTEND:20260824T150000Z
SUMMARY:Standup (moved)
END:VEVENT
END:VCALENDAR`;

const ONE_OFFS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dentist
DTSTART:20260820T090000Z
DTEND:20260820T100000Z
SUMMARY:Dentist
END:VEVENT
BEGIN:VEVENT
UID:called-off
DTSTART:20260821T090000Z
DTEND:20260821T100000Z
STATUS:CANCELLED
SUMMARY:Called off
END:VEVENT
END:VCALENDAR`;

beforeEach(() => {
  store.clearEvents();
  for (const ev of parseIcs(ICS, { timezone: 'UTC' })) {
    store.setEventSilent({ ...ev, calendarId: 'cal', href: 'http://cal/series.ics' });
  }
  for (const ev of parseIcs(ONE_OFFS, { timezone: 'UTC' })) {
    store.setEventSilent({ ...ev, calendarId: 'cal', href: `http://cal/${ev.uid}.ics` });
  }
});

it('expands series, replaces moved occurrences and skips cancelled events', () => {
  const found = occurrencesInRange(
    new Date('2026-08-01T00:00:00Z'),
    new Date('2026-09-01T00:00:00Z'),
  );
  const starts = found.map((ev) => `${ev.title}@${ev.start}`).sort();
  assert.deepEqual(starts, [
    'Dentist@2026-08-20T09:00:00.000Z',
    'Standup (moved)@2026-08-24T14:00:00.000Z',
    'Standup@2026-08-17T10:00:00.000Z',
    'Standup@2026-08-31T10:00:00.000Z',
  ]);
});
