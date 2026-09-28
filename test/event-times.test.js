// Date arithmetic behind the event editor's From/To fields, and the NLP parser's
// end handling it relies on. eventTimes.js is DOM-free browser code so it can be
// imported here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parse } = require('../server/nlp/parser');

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', 'client', 'components', 'eventTimes.js'),
).href;

function loadTimes() {
  return import(MODULE_URL);
}

test('moving the start later carries an overnight end past midnight', async () => {
  const { shiftEndWithStart } = await loadTimes();
  const end = shiftEndWithStart(
    { date: '2026-09-28', time: '22:00' },
    { date: '2026-09-28', time: '23:30' },
    { date: '2026-09-28', time: '23:45' },
  );
  assert.deepStrictEqual(end, { date: '2026-09-29', time: '01:15' });
});

test('moving the start earlier pulls an end back across midnight', async () => {
  const { shiftEndWithStart } = await loadTimes();
  const end = shiftEndWithStart(
    { date: '2026-09-28', time: '23:00' },
    { date: '2026-09-28', time: '20:00' },
    { date: '2026-09-29', time: '01:00' },
  );
  assert.deepStrictEqual(end, { date: '2026-09-28', time: '22:00' });
});

test('moving the start date keeps the wall-clock end across a DST change', async () => {
  const { shiftEndWithStart } = await loadTimes();
  // Europe/Oslo leaves summer time on 2026-10-25; the fields hold wall clock,
  // so a 10:00–11:00 event moved over it is still 10:00–11:00.
  const end = shiftEndWithStart(
    { date: '2026-10-24', time: '10:00' },
    { date: '2026-10-26', time: '10:00' },
    { date: '2026-10-24', time: '11:00' },
  );
  assert.deepStrictEqual(end, { date: '2026-10-26', time: '11:00' });
});

test('addDays steps over a DST change and month ends by whole days', async () => {
  const { addDays } = await loadTimes();
  assert.strictEqual(addDays('2026-03-28', 2), '2026-03-30');
  assert.strictEqual(addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(addDays('2026-03-01', -1), '2026-02-28');
});

test('addMinutes rolls a default length over midnight', async () => {
  const { addMinutes } = await loadTimes();
  assert.deepStrictEqual(addMinutes({ date: '2026-09-28', time: '23:30' }, 60), {
    date: '2026-09-29',
    time: '00:30',
  });
  assert.deepStrictEqual(addMinutes({ date: '2026-09-28', time: '09:00' }, 36 * 60), {
    date: '2026-09-29',
    time: '21:00',
  });
});

test('all-day ranges round-trip between inclusive fields and exclusive DTEND', async () => {
  const { allDayLastDay, allDayRange } = await loadTimes();
  const { start, end } = allDayRange('2026-09-10', '2026-09-12');
  assert.strictEqual(start.toISOString(), '2026-09-10T00:00:00.000Z');
  assert.strictEqual(end.toISOString(), '2026-09-13T00:00:00.000Z');
  assert.strictEqual(allDayLastDay(start.toISOString(), end.toISOString()), '2026-09-12');
  // A one-day event, and a malformed end at the start, both show one day.
  assert.strictEqual(allDayLastDay('2026-09-10T00:00:00Z', '2026-09-11T00:00:00Z'), '2026-09-10');
  assert.strictEqual(allDayLastDay('2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z'), '2026-09-10');
  // A last day before the start is clamped to a single day.
  assert.strictEqual(
    allDayRange('2026-09-10', '2026-09-08').end.toISOString(),
    '2026-09-11T00:00:00.000Z',
  );
});

test('switching a timed event to all-day ignores an end at exactly midnight', async () => {
  const { lastDayOfTimedRange } = await loadTimes();
  assert.strictEqual(lastDayOfTimedRange('2026-09-28', '2026-09-29', '00:00'), '2026-09-28');
  assert.strictEqual(lastDayOfTimedRange('2026-09-28', '2026-09-29', '01:00'), '2026-09-29');
  assert.strictEqual(lastDayOfTimedRange('2026-09-28', '2026-09-28', '17:00'), '2026-09-28');
});

test('nlpEventEnd applies the default length only when no end was named', async () => {
  const { nlpEventEnd } = await loadTimes();
  const start = '2026-09-28T12:00:00.000Z';
  const fallback = '2026-09-28T13:00:00.000Z';
  assert.strictEqual(
    nlpEventEnd({ start, end: fallback, explicitEnd: false }, 90),
    '2026-09-28T13:30:00.000Z',
  );
  assert.strictEqual(
    nlpEventEnd({ start, end: '2026-09-28T14:00:00.000Z', explicitEnd: true }, 90),
    '2026-09-28T14:00:00.000Z',
  );
  // Crosses midnight rather than clamping to the day.
  assert.strictEqual(
    nlpEventEnd({ start: '2026-09-28T23:00:00.000Z', end: '', explicitEnd: false }, 120),
    '2026-09-29T01:00:00.000Z',
  );
});

// Reference date: Monday 2026-09-28, noon in Oslo.
const REF = new Date('2026-09-28T10:00:00Z');

test('parser reports whether the phrase named an end', () => {
  const single = parse('Lunch tomorrow 14:00', REF, 'Europe/Oslo');
  assert.strictEqual(single.explicitEnd, false);
  assert.strictEqual(single.start, '2026-09-29T12:00:00.000Z');

  const range = parse('Meeting tomorrow 14-16', REF, 'Europe/Oslo');
  assert.strictEqual(range.explicitEnd, true);
  assert.strictEqual(range.start, '2026-09-29T12:00:00.000Z');
  assert.strictEqual(range.end, '2026-09-29T14:00:00.000Z');
});

test('parser converts wall-clock times on either side of a DST change', () => {
  const summer = parse('Call 24 october 10:00', REF, 'Europe/Oslo');
  const winter = parse('Call 26 october 10:00', REF, 'Europe/Oslo');
  assert.strictEqual(summer.start, '2026-10-24T08:00:00.000Z');
  assert.strictEqual(winter.start, '2026-10-26T09:00:00.000Z');
});

test('parser stores an all-day day as UTC midnights with an exclusive end', () => {
  const day = parse('Holiday 10 october', REF, 'Europe/Oslo');
  assert.strictEqual(day.allDay, true);
  assert.strictEqual(day.start, '2026-10-10T00:00:00.000Z');
  assert.strictEqual(day.end, '2026-10-11T00:00:00.000Z');
});

test('parser keeps the last day of an all-day range', () => {
  const trip = parse('Trip 10 october - 12 october', REF, 'America/New_York');
  assert.strictEqual(trip.allDay, true);
  assert.strictEqual(trip.explicitEnd, true);
  assert.strictEqual(trip.start, '2026-10-10T00:00:00.000Z');
  assert.strictEqual(trip.end, '2026-10-13T00:00:00.000Z');
});

test('parser trusts a timezone written in the phrase', () => {
  const call = parse('Call tomorrow 14:00 UTC', REF, 'Europe/Oslo');
  assert.strictEqual(call.start, '2026-09-29T14:00:00.000Z');
});
