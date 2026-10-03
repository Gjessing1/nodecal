// Writing an event back must not strip what other clients put in the VEVENT:
// only the properties whose field changed are regenerated.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs, serializeEvent, serializeEvents } = require('../server/caldav/vevent');

const OSLO = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Oslo',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** @param {string[]} vevent - VEVENT body lines, without BEGIN/END */
function calendar(vevent) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Other client//EN',
    ...OSLO,
    'BEGIN:VEVENT',
    ...vevent,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** The first VEVENT's lines as written, unfolded. */
function eventLines(ics) {
  const lines = ics.replace(/\r\n[ \t]/g, '').split('\r\n');
  return lines.slice(lines.indexOf('BEGIN:VEVENT') + 1, lines.indexOf('END:VEVENT'));
}

const ATTENDEE =
  'ATTENDEE;CN=Kari Nordmann;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:kari.nordmann@example.com';

// A Thunderbird-style weekly meeting: zoned times, a DURATION, attendees,
// split categories, a zoned EXDATE and two alarms, the first an email alarm
// Nodecal cannot show.
const MEETING = calendar([
  'UID:m1',
  'DTSTAMP:20260901T080000Z',
  'CREATED:20260901T080000Z',
  'SEQUENCE:2',
  'SUMMARY;LANGUAGE=nb:Planlegging',
  'DESCRIPTION:Agenda',
  'ORGANIZER;CN=Ola:mailto:ola@example.com',
  ATTENDEE,
  'X-MOZ-GENERATION:4',
  'CATEGORIES:Work',
  'CATEGORIES:Team',
  'DTSTART;TZID=Europe/Oslo:20261005T100000',
  'DURATION:PT1H',
  'RRULE:FREQ=WEEKLY',
  'RDATE;TZID=Europe/Oslo:20261008T100000',
  'EXDATE;TZID=Europe/Oslo:20261012T100000',
  'BEGIN:VALARM',
  'ACTION:EMAIL',
  'SUMMARY:Mail reminder',
  'DESCRIPTION:Mail body',
  'TRIGGER;VALUE=DATE-TIME:20261005T060000Z',
  'END:VALARM',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:Planlegging',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'BEGIN:VALARM',
  'ACTION:AUDIO',
  'TRIGGER:-PT5M',
  'END:VALARM',
]);

describe('reading a VEVENT', () => {
  it('reads the event from its own properties, not its alarms', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    assert.equal(ev.title, 'Planlegging');
    assert.equal(ev.description, 'Agenda');
    assert.equal(ev.start, '2026-10-05T08:00:00.000Z');
    assert.equal(ev.end, '2026-10-05T09:00:00.000Z');
    assert.deepEqual(ev.categories, ['Work', 'Team']);
    assert.deepEqual(ev.exdates, ['20261012T100000']);
    assert.equal(ev.alarmMinutes, 15);
  });

  it("keeps an empty description on Nodecal's own event with a reminder", () => {
    const ics = serializeEvent({
      uid: 'n1',
      title: 'Dentist',
      start: '2026-10-05T08:00:00.000Z',
      end: '2026-10-05T09:00:00.000Z',
      allDay: false,
      description: '',
      alarmMinutes: 30,
    });
    const [ev] = parseIcs(ics);
    assert.equal(ev.description, '', 'the VALARM description became the event description');
    assert.equal(ev.alarmMinutes, 30);
  });
});

describe('writing a VEVENT back', () => {
  it('rewrites only the field that changed', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    const ics = serializeEvent({ ...ev, title: 'Planning' }, { timezone: 'UTC' });
    const lines = eventLines(ics);

    assert.ok(lines.includes('SUMMARY:Planning'));
    assert.ok(!lines.some((l) => l.startsWith('SUMMARY;LANGUAGE')));
    for (const kept of [
      'CREATED:20260901T080000Z',
      'SEQUENCE:2',
      'DESCRIPTION:Agenda',
      'ORGANIZER;CN=Ola:mailto:ola@example.com',
      ATTENDEE,
      'X-MOZ-GENERATION:4',
      'CATEGORIES:Work',
      'CATEGORIES:Team',
      'DTSTART;TZID=Europe/Oslo:20261005T100000',
      'DURATION:PT1H',
      'RRULE:FREQ=WEEKLY',
      'RDATE;TZID=Europe/Oslo:20261008T100000',
      'EXDATE;TZID=Europe/Oslo:20261012T100000',
      'ACTION:EMAIL',
      'TRIGGER:-PT15M',
      'ACTION:AUDIO',
    ]) {
      assert.ok(lines.includes(kept), `lost ${kept}`);
    }
    assert.ok(!lines.includes('DTSTAMP:20260901T080000Z'), 'DTSTAMP describes this write');
    assert.ok(ics.includes('TZID:Europe/Oslo'), 'the VTIMEZONE a kept TZID needs was dropped');
    for (const line of ics.split('\r\n')) assert.ok(line.length <= 75, `unfolded: ${line}`);
  });

  it('writes a moved time in the zone it was in', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    // The editor drops RDATEs when it moves a series (editedEvent in events.js).
    const moved = {
      ...ev,
      start: '2026-10-05T09:00:00.000Z',
      end: '2026-10-05T10:30:00.000Z',
      rdates: null,
    };
    const lines = eventLines(serializeEvent(moved, { timezone: 'UTC' }));

    assert.ok(lines.includes('DTSTART;TZID=Europe/Oslo:20261005T110000'));
    assert.ok(lines.includes('DTEND;TZID=Europe/Oslo:20261005T123000'));
    assert.ok(!lines.some((l) => l.startsWith('DURATION')), 'DURATION next to DTEND');
    assert.ok(!lines.some((l) => l.startsWith('RDATE')));
    assert.ok(lines.includes(ATTENDEE));

    const [again] = parseIcs(calendar(lines), { timezone: 'UTC' });
    assert.equal(again.start, moved.start);
    assert.equal(again.end, moved.end);
  });

  it('replaces only the alarm Nodecal shows', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    const lines = eventLines(serializeEvent({ ...ev, alarmMinutes: 60 }, { timezone: 'UTC' }));

    assert.ok(lines.includes('TRIGGER:-PT1H'));
    assert.ok(!lines.includes('TRIGGER:-PT15M'));
    assert.ok(lines.includes('ACTION:EMAIL'));
    assert.ok(lines.includes('ACTION:AUDIO'));
    assert.equal(lines.filter((l) => l === 'BEGIN:VALARM').length, 3);

    const none = eventLines(serializeEvent({ ...ev, alarmMinutes: null }, { timezone: 'UTC' }));
    assert.equal(none.filter((l) => l === 'BEGIN:VALARM').length, 2);
  });

  it('keeps zoned EXDATEs when one is added or removed', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    const added = { ...ev, exdates: [...ev.exdates, '20261019T080000Z'] };
    const lines = eventLines(serializeEvent(added, { timezone: 'UTC' }));
    assert.ok(lines.includes('EXDATE;TZID=Europe/Oslo:20261012T100000'));
    assert.ok(lines.includes('EXDATE:20261019T080000Z'));

    const cleared = eventLines(serializeEvent({ ...ev, exdates: null }, { timezone: 'UTC' }));
    assert.ok(!cleared.some((l) => l.startsWith('EXDATE')));
  });

  it('writes RDATEs from the list, keeping a zoned line still in it', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    assert.deepEqual(ev.rdates, ['20261008T100000']);

    const added = { ...ev, rdates: [...ev.rdates, '20261009', '20261010T080000Z/PT2H'] };
    const lines = eventLines(serializeEvent(added, { timezone: 'UTC' }));
    assert.ok(lines.includes('RDATE;TZID=Europe/Oslo:20261008T100000'));
    assert.ok(lines.includes('RDATE;VALUE=DATE:20261009'));
    assert.ok(lines.includes('RDATE;VALUE=PERIOD:20261010T080000Z/PT2H'));

    // A record cached before RDATEs were read keeps the ones it had.
    const legacy = { ...ev };
    delete legacy.rdates;
    const kept = eventLines(serializeEvent(legacy, { timezone: 'UTC' }));
    assert.ok(kept.includes('RDATE;TZID=Europe/Oslo:20261008T100000'));
  });

  it('builds an override from its master without the recurrence', () => {
    const [master] = parseIcs(MEETING, { timezone: 'UTC' });
    const override = {
      ...master,
      title: 'Planning (moved)',
      start: '2026-10-20T09:00:00.000Z',
      end: '2026-10-20T10:00:00.000Z',
      recurrenceId: '2026-10-19T08:00:00.000Z',
      rrule: null,
      exdates: null,
      rdates: null,
    };
    const ics = serializeEvents([master, override], { timezone: 'UTC' });
    const written = parseIcs(ics, { timezone: 'UTC' });
    assert.equal(written.length, 2);

    const lines = eventLines(ics.slice(ics.indexOf('END:VEVENT') + 'END:VEVENT'.length));
    assert.ok(lines.includes('RECURRENCE-ID;TZID=Europe/Oslo:20261019T100000'));
    for (const prefix of ['RRULE', 'RDATE', 'EXDATE']) {
      assert.ok(!lines.some((l) => l.startsWith(prefix)), `override kept its master's ${prefix}`);
    }
    assert.ok(lines.includes(ATTENDEE));
    assert.equal(ics.split('BEGIN:VTIMEZONE').length, 2, 'VTIMEZONE written twice');
    assert.equal(written[1].recurrenceId, '2026-10-19T08:00:00.000Z');
  });

  it('keeps a line break in an edited URL from starting a new property', () => {
    const [ev] = parseIcs(MEETING, { timezone: 'UTC' });
    const url = 'https://example.com/a\r\nATTENDEE:mailto:x@example.com';
    const lines = eventLines(serializeEvent({ ...ev, url }, { timezone: 'UTC' }));
    assert.ok(lines.includes('URL:https://example.com/aATTENDEE:mailto:x@example.com'));
    assert.equal(lines.filter((l) => l.startsWith('ATTENDEE')).length, 1);
  });

  it('writes a new event from its fields alone', () => {
    const ics = serializeEvent({
      uid: 'n2',
      title: 'Trip',
      start: '2026-10-05T00:00:00.000Z',
      end: '2026-10-08T00:00:00.000Z',
      allDay: true,
      categories: ['Travel'],
      rrule: null,
    });
    const lines = eventLines(ics);
    assert.ok(lines.includes('DTSTART;VALUE=DATE:20261005'));
    assert.ok(lines.includes('DTEND;VALUE=DATE:20261008'));
    assert.ok(lines.includes('CATEGORIES:Travel'));
    assert.ok(!ics.includes('VTIMEZONE'));
  });
});
