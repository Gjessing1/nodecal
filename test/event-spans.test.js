// Span/lane math for multi-day events in the week all-day row and the month
// grid. client/ is browser ES-module code, but eventSpans.js is deliberately
// DOM-free so it can be imported here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', 'client', 'views', 'eventSpans.js'),
).href;

function loadSpans() {
  return import(MODULE_URL);
}

/** An all-day event, stored the way the server stores them: UTC midnight, exclusive end. */
function allDay(title, startDay, endDayExclusive) {
  return {
    id: title,
    title,
    allDay: true,
    calendarId: 'c1',
    start: `${startDay}T00:00:00Z`,
    end: `${endDayExclusive}T00:00:00Z`,
  };
}

/** A timed event built from local wall-clock parts, so the test holds in any TZ. */
function timed(title, start, end) {
  return { id: title, title, allDay: false, calendarId: 'c1', start, end };
}

function localIso(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

const WEEK = [
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21',
  '2026-08-22',
  '2026-08-23',
];

test('an all-day event covers every day up to its exclusive end', async () => {
  const { eventDayRange } = await loadSpans();
  const range = eventDayRange(allDay('Trip', '2026-08-17', '2026-08-20'));
  assert.deepStrictEqual(range, { startStr: '2026-08-17', endStr: '2026-08-19' });
});

test('a one-day all-day event starts and ends on the same day', async () => {
  const { eventDayRange } = await loadSpans();
  const range = eventDayRange(allDay('Holiday', '2026-08-17', '2026-08-18'));
  assert.deepStrictEqual(range, { startStr: '2026-08-17', endStr: '2026-08-17' });
});

test('a timed event crossing midnight covers both local days', async () => {
  const { eventDayRange } = await loadSpans();
  const ev = timed('Night shift', localIso(2026, 8, 20, 22, 0), localIso(2026, 8, 21, 2, 0));
  assert.deepStrictEqual(eventDayRange(ev), { startStr: '2026-08-20', endStr: '2026-08-21' });
});

test('a timed event ending exactly at midnight stays on the day it started', async () => {
  const { eventDayRange } = await loadSpans();
  const ev = timed('Evening', localIso(2026, 8, 20, 20, 0), localIso(2026, 8, 21, 0, 0));
  assert.deepStrictEqual(eventDayRange(ev), { startStr: '2026-08-20', endStr: '2026-08-20' });
});

test('a span inside the week is not marked as continuing', async () => {
  const { spanForDays } = await loadSpans();
  const span = spanForDays(allDay('Trip', '2026-08-18', '2026-08-21'), WEEK);
  assert.strictEqual(span.startIdx, 1);
  assert.strictEqual(span.endIdx, 3);
  assert.strictEqual(span.continuesBefore, false);
  assert.strictEqual(span.continuesAfter, false);
});

test('a span overrunning the week is clamped and flagged at both ends', async () => {
  const { spanForDays } = await loadSpans();
  const span = spanForDays(allDay('Long', '2026-08-10', '2026-09-01'), WEEK);
  assert.strictEqual(span.startIdx, 0);
  assert.strictEqual(span.endIdx, 6);
  assert.strictEqual(span.continuesBefore, true);
  assert.strictEqual(span.continuesAfter, true);
});

test('an event ending on the week start day still shows on that day', async () => {
  const { spanForDays } = await loadSpans();
  const span = spanForDays(allDay('Ends Mon', '2026-08-14', '2026-08-18'), WEEK);
  assert.strictEqual(span.startIdx, 0);
  assert.strictEqual(span.endIdx, 0);
  assert.strictEqual(span.continuesBefore, true);
  assert.strictEqual(span.continuesAfter, false);
});

test('an event outside the week gets no span', async () => {
  const { spanForDays } = await loadSpans();
  assert.strictEqual(spanForDays(allDay('Before', '2026-08-10', '2026-08-17'), WEEK), null);
  assert.strictEqual(spanForDays(allDay('After', '2026-08-24', '2026-08-26'), WEEK), null);
});

test('overlapping spans get separate lanes, and a lane is reused once free', async () => {
  const { layoutSpans } = await loadSpans();
  const spans = layoutSpans(
    [
      allDay('A', '2026-08-17', '2026-08-20'), // Mon–Wed
      allDay('B', '2026-08-18', '2026-08-21'), // Tue–Thu, overlaps A
      allDay('C', '2026-08-22', '2026-08-23'), // Sat, clear of both
    ],
    WEEK,
  );
  const lanes = {};
  for (const span of spans) lanes[span.event.title] = span.lane;
  assert.deepStrictEqual(lanes, { A: 0, B: 1, C: 0 });
});

test('the longer of two spans starting together takes the top lane', async () => {
  const { layoutSpans } = await loadSpans();
  const spans = layoutSpans(
    [allDay('Short', '2026-08-17', '2026-08-18'), allDay('Long', '2026-08-17', '2026-08-22')],
    WEEK,
  );
  const lanes = {};
  for (const span of spans) lanes[span.event.title] = span.lane;
  assert.deepStrictEqual(lanes, { Long: 0, Short: 1 });
});

test('spanPosition names each end of a run', async () => {
  const { eventDayRange, spanPosition } = await loadSpans();
  const range = eventDayRange(allDay('Trip', '2026-08-17', '2026-08-20'));
  assert.strictEqual(spanPosition(range, '2026-08-17'), 'start');
  assert.strictEqual(spanPosition(range, '2026-08-18'), 'middle');
  assert.strictEqual(spanPosition(range, '2026-08-19'), 'end');

  const one = eventDayRange(allDay('One', '2026-08-17', '2026-08-18'));
  assert.strictEqual(spanPosition(one, '2026-08-17'), 'single');
});

test('day counting survives a DST boundary', async () => {
  const { dayDiff } = await loadSpans();
  assert.strictEqual(dayDiff('2026-03-28', '2026-03-30'), 2);
  assert.strictEqual(dayDiff('2026-10-24', '2026-10-26'), 2);
  assert.strictEqual(dayDiff('2026-08-20', '2026-08-19'), -1);
});
