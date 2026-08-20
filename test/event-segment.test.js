// Clipping a timed event to one day column of the day/week time grid. client/ is
// browser ES-module code, but eventSegment.js is deliberately DOM-free so it can
// be imported here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', 'client', 'views', 'eventSegment.js'),
).href;

function loadSegment() {
  return import(MODULE_URL);
}

/** Local wall-clock parts to the stored UTC ISO string, so the test holds in any TZ. */
function localIso(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

/** Local midnight opening the given day, the way day.js and week.js build it. */
function dayStart(y, m, d) {
  return new Date(y, m - 1, d);
}

function timed(start, end) {
  return { id: 'e1', title: 'E', allDay: false, calendarId: 'c1', start, end };
}

test('an event inside one day is not clipped at either end', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 9, 0), localIso(2026, 8, 20, 10, 30));
  const seg = clipEventToDay(ev, dayStart(2026, 8, 20), dayStart(2026, 8, 21));
  assert.equal(seg.start.getTime(), new Date(ev.start).getTime());
  assert.equal(seg.end.getTime(), new Date(ev.end).getTime());
  assert.equal(seg.continuesBefore, false);
  assert.equal(seg.continuesAfter, false);
});

test('an event crossing midnight stops at the end of its first day', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 22, 0), localIso(2026, 8, 21, 2, 0));
  const seg = clipEventToDay(ev, dayStart(2026, 8, 20), dayStart(2026, 8, 21));
  assert.equal(seg.start.getTime(), new Date(ev.start).getTime());
  assert.equal(seg.end.getTime(), dayStart(2026, 8, 21).getTime());
  assert.equal(seg.continuesBefore, false);
  assert.equal(seg.continuesAfter, true);
});

test('the same event resumes at midnight on the next day', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 22, 0), localIso(2026, 8, 21, 2, 0));
  const seg = clipEventToDay(ev, dayStart(2026, 8, 21), dayStart(2026, 8, 22));
  assert.equal(seg.start.getTime(), dayStart(2026, 8, 21).getTime());
  assert.equal(seg.end.getTime(), new Date(ev.end).getTime());
  assert.equal(seg.continuesBefore, true);
  assert.equal(seg.continuesAfter, false);
});

test('a middle day of a long event is clipped at both ends', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 22, 0), localIso(2026, 8, 23, 2, 0));
  const seg = clipEventToDay(ev, dayStart(2026, 8, 21), dayStart(2026, 8, 22));
  assert.equal(seg.start.getTime(), dayStart(2026, 8, 21).getTime());
  assert.equal(seg.end.getTime(), dayStart(2026, 8, 22).getTime());
  assert.equal(seg.continuesBefore, true);
  assert.equal(seg.continuesAfter, true);
});

test('an event ending exactly at midnight belongs to the day before', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 22, 0), localIso(2026, 8, 21, 0, 0));
  const before = clipEventToDay(ev, dayStart(2026, 8, 20), dayStart(2026, 8, 21));
  assert.equal(before.continuesAfter, false);
  assert.equal(before.end.getTime(), dayStart(2026, 8, 21).getTime());
  assert.equal(clipEventToDay(ev, dayStart(2026, 8, 21), dayStart(2026, 8, 22)), null);
});

test('a day the event never reaches gets nothing', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 9, 0), localIso(2026, 8, 20, 10, 0));
  assert.equal(clipEventToDay(ev, dayStart(2026, 8, 19), dayStart(2026, 8, 20)), null);
  assert.equal(clipEventToDay(ev, dayStart(2026, 8, 21), dayStart(2026, 8, 22)), null);
});

test('a zero-length event still paints on its own day', async () => {
  const { clipEventToDay } = await loadSegment();
  const at = localIso(2026, 8, 20, 9, 0);
  const seg = clipEventToDay(timed(at, at), dayStart(2026, 8, 20), dayStart(2026, 8, 21));
  assert.equal(seg.start.getTime(), seg.end.getTime());
  assert.equal(seg.continuesBefore, false);
  assert.equal(seg.continuesAfter, false);
});

test('an end before the start is treated as zero-length, not as a miss', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = timed(localIso(2026, 8, 20, 9, 0), localIso(2026, 8, 19, 9, 0));
  const seg = clipEventToDay(ev, dayStart(2026, 8, 20), dayStart(2026, 8, 21));
  assert.equal(seg.start.getTime(), new Date(ev.start).getTime());
  assert.equal(seg.end.getTime(), new Date(ev.start).getTime());
  assert.equal(clipEventToDay(ev, dayStart(2026, 8, 19), dayStart(2026, 8, 20)), null);
});

test('a missing end is treated as an instant at the start', async () => {
  const { clipEventToDay } = await loadSegment();
  const ev = { id: 'e1', title: 'E', allDay: false, start: localIso(2026, 8, 20, 9, 0) };
  const seg = clipEventToDay(ev, dayStart(2026, 8, 20), dayStart(2026, 8, 21));
  assert.equal(seg.start.getTime(), new Date(ev.start).getTime());
  assert.equal(seg.end.getTime(), new Date(ev.start).getTime());
});
