// A series written in a zone repeats at the same wall time, so its UTC instant
// moves at each DST change. Europe/Oslo leaves summer time on 25 Oct 2026.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandRecurring, parseExdate } = require('../server/caldav/recurrence');
const { expandSeries, indexOverrides } = require('../server/caldav/overrides');
const { parseIcs, writtenLines } = require('../server/caldav/vevent');

const FROM = new Date('2026-10-01T00:00:00Z');
const TO = new Date('2026-11-30T00:00:00Z');

/** @param {string[]} vevent - VEVENT body lines, without BEGIN/END */
function calendar(vevent) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Other client//EN',
    'BEGIN:VEVENT',
    'UID:weekly',
    'SUMMARY:Standup',
    ...vevent,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** @param {string[]} vevent */
function weekly(vevent, timezone = 'UTC') {
  return parseIcs(calendar(vevent), { timezone })[0];
}

/** @param {Array<{start: string}>} occurrences */
function starts(occurrences) {
  return occurrences.map((occ) => occ.start);
}

describe('expanding a zoned series', () => {
  it('keeps the wall time across the DST change', () => {
    const ev = weekly([
      'DTSTART;TZID=Europe/Oslo:20261019T100000',
      'DTEND;TZID=Europe/Oslo:20261019T103000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
    ]);
    assert.equal(ev.zone, 'Europe/Oslo');
    const occ = expandRecurring(ev, FROM, TO);
    assert.deepEqual(starts(occ), [
      '2026-10-19T08:00:00.000Z',
      '2026-10-26T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
    assert.equal(occ[1].end, '2026-10-26T09:30:00.000Z');
    assert.equal(occ[1].id, 'weekly_20261026T090000Z');
  });

  it('reads a floating DTSTART in the configured zone', () => {
    const ev = weekly(['DTSTART:20261019T100000', 'RRULE:FREQ=WEEKLY;COUNT=2'], 'Europe/Oslo');
    assert.equal(ev.zone, 'Europe/Oslo');
    assert.deepEqual(starts(expandRecurring(ev, FROM, TO)), [
      '2026-10-19T08:00:00.000Z',
      '2026-10-26T09:00:00.000Z',
    ]);
  });

  it('leaves a UTC series on its instant', () => {
    const ev = weekly(['DTSTART:20261019T080000Z', 'RRULE:FREQ=WEEKLY;COUNT=2']);
    assert.equal(ev.zone, null);
    assert.deepEqual(starts(expandRecurring(ev, FROM, TO)), [
      '2026-10-19T08:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
    ]);
  });

  it('skips an EXDATE written in the series zone', () => {
    const ev = weekly([
      'DTSTART;TZID=Europe/Oslo:20261019T100000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE;TZID=Europe/Oslo:20261026T100000',
    ]);
    assert.deepEqual(starts(expandRecurring(ev, FROM, TO)), [
      '2026-10-19T08:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
    ]);
  });

  it('skips an EXDATE written in UTC', () => {
    const ev = weekly([
      'DTSTART;TZID=Europe/Oslo:20261019T100000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE:20261026T090000Z',
    ]);
    assert.equal(expandRecurring(ev, FROM, TO).length, 2);
  });

  it('keeps the occurrence a UTC UNTIL names exactly', () => {
    const ev = weekly([
      'DTSTART;TZID=Europe/Oslo:20261019T100000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261102T090000Z',
    ]);
    assert.equal(expandRecurring(ev, FROM, TO).length, 3);
  });

  it('drops an occurrence whose instant is outside the window', () => {
    const ev = weekly(['DTSTART;TZID=Pacific/Auckland:20261019T100000', 'RRULE:FREQ=DAILY']);
    const from = new Date('2026-10-20T00:00:00Z');
    const to = new Date('2026-10-21T00:00:00Z');
    for (const occ of expandRecurring(ev, from, to)) {
      assert.ok(new Date(occ.start) >= from && new Date(occ.start) <= to, occ.start);
    }
  });

  it('matches an override after the DST change', () => {
    const ics = calendar([
      'DTSTART;TZID=Europe/Oslo:20261019T100000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:weekly',
      'SUMMARY:Moved',
      'RECURRENCE-ID;TZID=Europe/Oslo:20261026T100000',
      'DTSTART;TZID=Europe/Oslo:20261026T140000',
    ]);
    const [master, override] = parseIcs(ics, { timezone: 'UTC' });
    const kept = expandSeries(master, indexOverrides([override]).get('weekly'), FROM, TO);
    assert.deepEqual(starts(kept), ['2026-10-19T08:00:00.000Z', '2026-11-02T09:00:00.000Z']);
  });
});

describe('parseExdate', () => {
  it('reads a time without Z in the given zone', () => {
    assert.equal(
      parseExdate('20261102T100000', 'Europe/Oslo').toISOString(),
      '2026-11-02T09:00:00.000Z',
    );
  });

  it('reads a time without Z as UTC when there is no zone', () => {
    assert.equal(parseExdate('20261102T100000').toISOString(), '2026-11-02T10:00:00.000Z');
  });
});

describe('writtenLines', () => {
  it('reports the zone of what was written', () => {
    const ics = calendar(['DTSTART;TZID=Europe/Oslo:20261019T100000']);
    assert.equal(writtenLines(ics)[0].zone, 'Europe/Oslo');
    assert.equal(writtenLines(calendar(['DTSTART:20261019T080000Z']))[0].zone, null);
  });
});
