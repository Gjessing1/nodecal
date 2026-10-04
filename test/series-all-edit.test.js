// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs } = require('../server/caldav/vevent');
const store = require('../server/cache/store');
const config = require('../server/config');
const { stubCaldav, restoreFetch, putEventRoute } = require('./helpers/caldav-stub');

// "All events" is saved from whichever occurrence the editor was opened on, and
// the editor sends that occurrence's times. They are a move of the series, not
// its new start: a title change made from a later occurrence must leave the
// series starting where it did, with its exceptions in place.
/** @type {Array<{method: string, url: string, body: string}>} */
let requests = [];

const HREF = 'http://localhost:5232/test/cal1/series-1.ics';

// Weekly from Mon 5 Oct, six times: 5, 12, 19, 26 Oct, 2 and 9 Nov. 2 Nov is
// skipped, 9 Nov was edited, and there are two extra dates.
const UTC_SERIES = [
  'DTSTART:20261005T100000Z',
  'DTEND:20261005T110000Z',
  'RRULE:FREQ=WEEKLY;COUNT=6',
  'EXDATE:20261102T100000Z',
  'RDATE:20261007T100000Z,20261028T100000Z',
];

/** @param {string[]} times - the master's time and rule lines */
function seed(times) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Other//EN',
    'BEGIN:VEVENT',
    'UID:series-1',
    'SUMMARY:Standup',
    ...times,
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
  for (const ev of parseIcs(ics, { timezone: config.app.timezone })) {
    store.setEventSilent({ ...ev, calendarId: '/cal1/', href: HREF, etag: 'v1' });
  }
}

/**
 * Save every occurrence from the editor opened on `occurrenceDate`.
 * @param {string} occurrenceDate
 * @param {object} body
 */
function editAll(occurrenceDate, body) {
  return putEventRoute('series-1', {
    uid: 'series-1',
    calendarId: '/cal1/',
    title: 'Standup',
    allDay: false,
    rrule: 'FREQ=WEEKLY;COUNT=6',
    recurrenceId: null,
    recurringScope: 'all',
    occurrenceDate,
    ...body,
  });
}

/** @param {{body: string}} req */
function vevents(req) {
  return parseIcs(req.body, { timezone: config.app.timezone });
}

/** @param {{body: string}} req */
function master(req) {
  return vevents(req).find((ev) => !ev.recurrenceId);
}

describe('editing every occurrence', () => {
  beforeEach(() => {
    store.clearEvents();
    requests = stubCaldav();
  });
  afterEach(() => {
    restoreFetch();
    store.clearEvents();
  });

  it('keeps the series start when edited from a later occurrence', async () => {
    seed(UTC_SERIES);
    const status = await editAll('2026-10-19T10:00:00.000Z', {
      title: 'Retro',
      start: '2026-10-19T10:00:00.000Z',
      end: '2026-10-19T11:00:00.000Z',
    });
    assert.equal(status, 200);
    assert.equal(requests.length, 1);

    const base = master(requests[0]);
    assert.equal(base.title, 'Retro');
    assert.equal(base.start, '2026-10-05T10:00:00.000Z');
    assert.equal(base.rrule, 'FREQ=WEEKLY;COUNT=6');
    assert.match(requests[0].body, /DTSTART:20261005T100000Z/);
    assert.match(requests[0].body, /EXDATE:20261102T100000Z/);
    assert.match(requests[0].body, /RDATE:20261007T100000Z,20261028T100000Z/);
    assert.match(requests[0].body, /RECURRENCE-ID:20261109T100000Z/);
  });

  it('moves the series and its exceptions by as much as the occurrence moved', async () => {
    seed(UTC_SERIES);
    await editAll('2026-10-19T10:00:00.000Z', {
      start: '2026-10-19T12:00:00.000Z',
      end: '2026-10-19T13:30:00.000Z',
    });

    const base = master(requests[0]);
    assert.equal(base.start, '2026-10-05T12:00:00.000Z');
    assert.equal(base.end, '2026-10-05T13:30:00.000Z');
    assert.equal(base.rrule, 'FREQ=WEEKLY;COUNT=6');
    assert.deepEqual(base.exdates, ['20261102T120000Z']);
    assert.deepEqual(base.rdates, ['20261007T120000Z', '20261028T120000Z']);
    assert.match(requests[0].body, /X-OTHER-CLIENT:kept/);
    const [late] = vevents(requests[0]).filter((ev) => ev.recurrenceId);
    assert.equal(late.recurrenceId, '2026-11-09T12:00:00.000Z');
    assert.equal(late.start, '2026-11-09T13:00:00.000Z');
  });

  it('moves the series start without an occurrence to measure from', async () => {
    seed(UTC_SERIES);
    await editAll(undefined, {
      start: '2026-10-06T10:00:00.000Z',
      end: '2026-10-06T11:00:00.000Z',
    });

    const base = master(requests[0]);
    assert.equal(base.start, '2026-10-06T10:00:00.000Z');
    assert.deepEqual(base.rdates, ['20261008T100000Z', '20261029T100000Z']);
    assert.deepEqual(store.getEvent('series-1').rdates, ['20261008T100000Z', '20261029T100000Z']);
  });

  it('measures the move on the series’ wall clock across DST', async () => {
    // 10:00 Oslo is 08:00Z in October and 09:00Z once DST ends on 25 Oct.
    seed([
      'DTSTART;TZID=Europe/Oslo:20261005T100000',
      'DTEND;TZID=Europe/Oslo:20261005T110000',
      'RRULE:FREQ=WEEKLY;COUNT=6',
    ]);
    await editAll('2026-11-02T09:00:00.000Z', {
      start: '2026-11-02T10:00:00.000Z',
      end: '2026-11-02T11:00:00.000Z',
    });

    assert.match(requests[0].body, /DTSTART;TZID=Europe\/Oslo:20261005T110000/);
    assert.match(requests[0].body, /DTEND;TZID=Europe\/Oslo:20261005T120000/);
  });

  it('turns the series into whole days from a later occurrence', async () => {
    seed(UTC_SERIES);
    await editAll('2026-10-19T10:00:00.000Z', {
      allDay: true,
      start: '2026-10-19T00:00:00.000Z',
      end: '2026-10-20T00:00:00.000Z',
    });

    const base = master(requests[0]);
    assert.equal(base.allDay, true);
    assert.equal(base.start, '2026-10-05T00:00:00.000Z');
    assert.equal(base.end, '2026-10-06T00:00:00.000Z');
    assert.equal(base.exdates, null);
    assert.equal(base.rdates, null);
    assert.equal(vevents(requests[0]).length, 1);
  });
});
