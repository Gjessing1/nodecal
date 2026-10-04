// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs } = require('../server/caldav/vevent');
const store = require('../server/cache/store');
const { stubCaldav, restoreFetch, putEventRoute } = require('./helpers/caldav-stub');

// "This and following" starts a new series from the edited occurrence on. It
// is the old series' resource from there, not a bare event built from the
// editor's fields: other clients' lines, the later EXDATEs, RDATEs and
// overrides, and what COUNT has left all come along.
/** @type {Array<{method: string, url: string, body: string}>} */
let requests = [];

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
function edit(body) {
  return putEventRoute('series-1', {
    uid: 'series-1',
    calendarId: '/cal1/',
    title: 'Standup',
    allDay: false,
    rrule: 'FREQ=WEEKLY;COUNT=6',
    recurrenceId: null,
    ...body,
  });
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
    requests = stubCaldav();
  });
  afterEach(() => {
    restoreFetch();
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

  it('moves the later exceptions with a moved time', async () => {
    await edit({
      recurringScope: 'future',
      occurrenceDate: '2026-10-19T10:00:00.000Z',
      start: '2026-10-19T12:00:00.000Z',
      end: '2026-10-19T13:00:00.000Z',
    });

    const tail = master(requests[0]);
    assert.equal(tail.start, '2026-10-19T12:00:00.000Z');
    assert.equal(tail.end, '2026-10-19T13:00:00.000Z');
    assert.equal(tail.rrule, 'FREQ=WEEKLY;COUNT=4');
    assert.deepEqual(tail.exdates, ['20261102T120000Z']);
    assert.deepEqual(tail.rdates, ['20261028T120000Z']);
    assert.match(requests[0].body, /ATTENDEE;CN=Kari/);
    const moved = vevents(requests[0]).filter((ev) => ev.recurrenceId);
    assert.equal(moved.length, 1, 'the edited 9 Nov was lost');
    assert.equal(moved[0].recurrenceId, '2026-11-09T12:00:00.000Z');
    assert.equal(moved[0].start, '2026-11-09T13:00:00.000Z');
    assert.equal(moved[0].title, 'Standup (late)');
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
