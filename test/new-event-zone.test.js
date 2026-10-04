// An event Nodecal writes for the first time has no line to take a zone from.
// Written in UTC, a weekly 10:00 Europe/Oslo made in October would show at
// 09:00 after 25 Oct in every client, so it goes in the configured zone along
// with a VTIMEZONE block for it.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseIcs,
  serializeEvent,
  serializeEvents,
  writtenLines,
} = require('../server/caldav/vevent');
const { expandRecurring } = require('../server/caldav/recurrence');
const { retimeSeries } = require('../server/caldav/seriesRetime');
const { vtimezoneLines } = require('../server/caldav/vtimezone');

const OSLO = { timezone: 'Europe/Oslo' };

// Mon 19 Oct 2026, 10:00–10:30 in Oslo (summer time, UTC+2).
const NEW_WEEKLY = {
  uid: 'new-weekly',
  title: 'Standup',
  start: '2026-10-19T08:00:00.000Z',
  end: '2026-10-19T08:30:00.000Z',
  allDay: false,
  rrule: 'FREQ=WEEKLY;COUNT=3',
  alarmMinutes: null,
  categories: [],
};

/** @param {string} ics */
function lines(ics) {
  return ics.split('\r\n');
}

/** @param {string} ics */
function timezoneBlocks(ics) {
  return lines(ics).filter((line) => line === 'BEGIN:VTIMEZONE').length;
}

describe('a new timed event', () => {
  it('is written in the configured zone', () => {
    const ics = serializeEvent(NEW_WEEKLY, OSLO);
    assert.ok(lines(ics).includes('DTSTART;TZID=Europe/Oslo:20261019T100000'));
    assert.ok(lines(ics).includes('DTEND;TZID=Europe/Oslo:20261019T103000'));
    assert.ok(lines(ics).includes('TZID:Europe/Oslo'));
    assert.equal(timezoneBlocks(ics), 1);
  });

  it('keeps its wall time across DST once read back', () => {
    const [ev] = parseIcs(serializeEvent(NEW_WEEKLY, OSLO), OSLO);
    assert.equal(ev.zone, 'Europe/Oslo');
    const starts = expandRecurring(ev, new Date('2026-10-01Z'), new Date('2026-11-30Z')).map(
      (occ) => occ.start,
    );
    assert.deepEqual(starts, [
      '2026-10-19T08:00:00.000Z',
      '2026-10-26T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
  });

  it('records the zone it was written in for the cache', () => {
    const [written] = writtenLines(serializeEvent(NEW_WEEKLY, OSLO), OSLO);
    assert.equal(written.zone, 'Europe/Oslo');
    assert.equal(written.rawTimezones[0], 'BEGIN:VTIMEZONE');
  });

  it('stays in UTC when UTC is the configured zone', () => {
    const ics = serializeEvent(NEW_WEEKLY, { timezone: 'UTC' });
    assert.ok(lines(ics).includes('DTSTART:20261019T080000Z'));
    assert.equal(timezoneBlocks(ics), 0);
  });

  it('writes a new override of a new series in the same zone, with one block', () => {
    const override = {
      ...NEW_WEEKLY,
      title: 'Standup (late)',
      rrule: null,
      recurrenceId: '2026-10-26T09:00:00.000Z',
      start: '2026-10-26T10:00:00.000Z',
      end: '2026-10-26T10:30:00.000Z',
    };
    const ics = serializeEvents([NEW_WEEKLY, override], OSLO);
    assert.ok(lines(ics).includes('RECURRENCE-ID;TZID=Europe/Oslo:20261026T100000'));
    assert.ok(lines(ics).includes('DTSTART;TZID=Europe/Oslo:20261026T110000'));
    assert.equal(timezoneBlocks(ics), 1);
  });
});

describe('an event read from CalDAV', () => {
  /** @param {string[]} times */
  function read(times) {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Other//EN',
      'BEGIN:VEVENT',
      'UID:series-1',
      'SUMMARY:Standup',
      ...times,
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    return parseIcs(ics, OSLO)[0];
  }

  it('stays in UTC when its UTC time moves', () => {
    const ev = read([
      'DTSTART:20261019T080000Z',
      'DTEND:20261019T083000Z',
      'EXDATE:20261026T080000Z',
    ]);
    const moved = { ...ev, start: '2026-10-19T09:00:00.000Z', end: '2026-10-19T09:30:00.000Z' };
    const ics = serializeEvent(moved, OSLO);
    assert.ok(lines(ics).includes('DTSTART:20261019T090000Z'));
    assert.equal(timezoneBlocks(ics), 0);
  });

  it('goes in the configured zone when a whole-day series is made timed', () => {
    const ev = read(['DTSTART;VALUE=DATE:20261019', 'DTEND;VALUE=DATE:20261020']);
    const edit = {
      start: '2026-10-19T08:00:00.000Z',
      end: '2026-10-19T08:30:00.000Z',
      allDay: false,
    };
    const { base } = retimeSeries({ base: ev, overrides: [] }, ev.start, edit, 'Europe/Oslo');
    const ics = serializeEvent(base, OSLO);
    assert.ok(lines(ics).includes('DTSTART;TZID=Europe/Oslo:20261019T100000'));
    assert.equal(parseIcs(ics, OSLO)[0].zone, 'Europe/Oslo');
    assert.equal(timezoneBlocks(ics), 1);
  });

  it('does not add a second block for a zone it already carries', () => {
    const block = vtimezoneLines('Europe/Oslo', 2026);
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      ...block,
      'BEGIN:VEVENT',
      'UID:zoned',
      'SUMMARY:Standup',
      'DTSTART;TZID=Europe/Oslo:20261019T100000',
      'DTEND;TZID=Europe/Oslo:20261019T103000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [ev] = parseIcs(ics, OSLO);
    const moved = { ...ev, start: '2026-10-19T09:00:00.000Z', end: '2026-10-19T09:30:00.000Z' };
    const written = serializeEvent(moved, OSLO);
    assert.ok(lines(written).includes('DTSTART;TZID=Europe/Oslo:20261019T110000'));
    assert.equal(timezoneBlocks(written), 1);
  });
});

describe('a built VTIMEZONE', () => {
  it('describes the yearly changes of a zone with DST', () => {
    assert.deepEqual(vtimezoneLines('America/New_York', 2026), [
      'BEGIN:VTIMEZONE',
      'TZID:America/New_York',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700308T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'DTSTART:19701101T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'END:STANDARD',
      'END:VTIMEZONE',
    ]);
  });

  it('puts the last-week changes of Europe on their 1970 days', () => {
    const block = vtimezoneLines('Europe/Oslo', 2026);
    assert.ok(block.includes('DTSTART:19700329T020000'));
    assert.ok(block.includes('DTSTART:19701025T030000'));
    assert.equal(
      block.filter((line) => line === 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU').length,
      1,
    );
  });

  it('has one fixed observance for a zone without DST', () => {
    assert.deepEqual(vtimezoneLines('Asia/Tokyo', 2026), [
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Tokyo',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0900',
      'TZOFFSETTO:+0900',
      'END:STANDARD',
      'END:VTIMEZONE',
    ]);
  });
});
