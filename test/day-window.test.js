// The day column window for the time grids. client/ is browser ES-module code,
// but dayWindow.js is deliberately DOM-free so it can be imported here.
//
// The bug this covers: day.js and week.js used to bucket events into columns
// with browser-local day boundaries while timeGrid.timeToTop positioned every
// block, the now-line and the auto-scroll offset in state.config.timezone. The
// two agree only while the configured zone is the device's — set TIMEZONE to
// anything else (or leave it unset, since server/config.js defaults it to
// 'UTC') and blocks are drawn at the wrong height in the wrong column.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'client', 'app', 'dayWindow.js')).href;
const SEGMENT_URL = pathToFileURL(
  path.join(__dirname, '..', 'client', 'views', 'eventSegment.js'),
).href;

function loadWindow() {
  return import(MODULE_URL);
}

test('dayWindow spans exactly the configured zone midnight to midnight', async () => {
  const { dayWindow } = await loadWindow();

  const utc = dayWindow('2026-08-21', 'UTC');
  assert.strictEqual(utc.start.toISOString(), '2026-08-21T00:00:00.000Z');
  assert.strictEqual(utc.end.toISOString(), '2026-08-22T00:00:00.000Z');

  // Oslo is UTC+2 in August, so its day opens two hours before UTC midnight.
  const oslo = dayWindow('2026-08-21', 'Europe/Oslo');
  assert.strictEqual(oslo.start.toISOString(), '2026-08-20T22:00:00.000Z');
  assert.strictEqual(oslo.end.toISOString(), '2026-08-21T22:00:00.000Z');

  // And a zone the other side of the line opens after it.
  const ny = dayWindow('2026-08-21', 'America/New_York');
  assert.strictEqual(ny.start.toISOString(), '2026-08-21T04:00:00.000Z');
  assert.strictEqual(ny.end.toISOString(), '2026-08-22T04:00:00.000Z');
});

test('a DST day is 23 or 25 hours long, not 24', async () => {
  const { dayWindow } = await loadWindow();
  const hours = (w) => (w.end.getTime() - w.start.getTime()) / 3600000;

  // Europe/Oslo springs forward 2026-03-29 and falls back 2026-10-25.
  assert.strictEqual(hours(dayWindow('2026-03-29', 'Europe/Oslo')), 23);
  assert.strictEqual(hours(dayWindow('2026-10-25', 'Europe/Oslo')), 25);
  assert.strictEqual(hours(dayWindow('2026-08-21', 'Europe/Oslo')), 24);
});

test('consecutive day windows meet exactly, leaving no gap or overlap', async () => {
  const { dayWindow, shiftDateStr } = await loadWindow();
  let dateStr = '2026-10-24';
  for (let i = 0; i < 4; i++) {
    const next = shiftDateStr(dateStr, 1);
    assert.strictEqual(
      dayWindow(dateStr, 'Europe/Oslo').end.getTime(),
      dayWindow(next, 'Europe/Oslo').start.getTime(),
      `${dateStr} must close exactly where ${next} opens`,
    );
    dateStr = next;
  }
});

test('shiftDateStr crosses months and DST without drifting', async () => {
  const { shiftDateStr } = await loadWindow();
  assert.strictEqual(shiftDateStr('2026-08-21', 1), '2026-08-22');
  assert.strictEqual(shiftDateStr('2026-08-31', 1), '2026-09-01');
  assert.strictEqual(shiftDateStr('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(shiftDateStr('2026-03-29', 1), '2026-03-30');
  assert.strictEqual(shiftDateStr('2026-01-01', -1), '2025-12-31');
});

test('timeOnDay names a wall-clock time in the configured zone', async () => {
  const { timeOnDay } = await loadWindow();

  // 08:00 in Oslo in August is 06:00 UTC — the auto-scroll target and the
  // long-press create time both used to be 08:00 in the *browser's* zone.
  assert.strictEqual(
    timeOnDay('2026-08-21', 8 * 60, 'Europe/Oslo').toISOString(),
    '2026-08-21T06:00:00.000Z',
  );
  assert.strictEqual(
    timeOnDay('2026-08-21', 8 * 60, 'UTC').toISOString(),
    '2026-08-21T08:00:00.000Z',
  );
  // Half-hour grid snap, and the last slot the grid offers.
  assert.strictEqual(
    timeOnDay('2026-08-21', 14 * 60 + 30, 'UTC').toISOString(),
    '2026-08-21T14:30:00.000Z',
  );
  assert.strictEqual(
    timeOnDay('2026-08-21', 23 * 60, 'UTC').toISOString(),
    '2026-08-21T23:00:00.000Z',
  );
});

test('todayStr reads the date in the configured zone, not the browser', async () => {
  const { todayStr } = await loadWindow();
  // Whatever zone the test host runs in, these two must be the dates those
  // zones are actually on right now.
  const inZone = (tz) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  for (const tz of ['UTC', 'Europe/Oslo', 'America/New_York', 'Pacific/Kiritimati']) {
    assert.strictEqual(todayStr(tz), inZone(tz), `todayStr must match ${tz}`);
  }
});

test('an event is bucketed into the column that will draw it at the right height', async () => {
  const { dayWindow } = await loadWindow();
  const { clipEventToDay } = await import(SEGMENT_URL);

  // 23:30 UTC on the 21st is 01:30 on the 22nd in Oslo. Under the old
  // browser-local bucketing a UTC browser filed it on the 21st, while
  // timeToTop drew it at 01:30 — the top of the column, on the wrong day.
  const ev = { start: '2026-08-21T23:30:00.000Z', end: '2026-08-22T00:30:00.000Z' };

  const on21 = dayWindow('2026-08-21', 'Europe/Oslo');
  const on22 = dayWindow('2026-08-22', 'Europe/Oslo');
  assert.strictEqual(clipEventToDay(ev, on21.start, on21.end), null, 'must not land on the 21st');

  const seg = clipEventToDay(ev, on22.start, on22.end);
  assert.ok(seg, 'must land on the 22nd, the day Oslo says it starts');
  assert.strictEqual(seg.start.toISOString(), '2026-08-21T23:30:00.000Z');
  assert.strictEqual(seg.continuesBefore, false);
  assert.strictEqual(seg.continuesAfter, false);
});

test('an event crossing the configured zone midnight splits across its two columns', async () => {
  const { dayWindow } = await loadWindow();
  const { clipEventToDay } = await import(SEGMENT_URL);

  // 21:00–01:00 Oslo wall clock on 2026-08-21 → 19:00Z to 23:00Z.
  const ev = { start: '2026-08-21T19:00:00.000Z', end: '2026-08-21T23:00:00.000Z' };

  const on21 = dayWindow('2026-08-21', 'Europe/Oslo');
  const first = clipEventToDay(ev, on21.start, on21.end);
  assert.ok(first);
  assert.strictEqual(first.continuesBefore, false);
  assert.strictEqual(first.continuesAfter, true, 'runs past Oslo midnight');
  assert.strictEqual(first.end.toISOString(), '2026-08-21T22:00:00.000Z');

  const on22 = dayWindow('2026-08-22', 'Europe/Oslo');
  const second = clipEventToDay(ev, on22.start, on22.end);
  assert.ok(second);
  assert.strictEqual(second.continuesBefore, true, 'the tail is a continuation');
  assert.strictEqual(second.start.toISOString(), '2026-08-21T22:00:00.000Z');
  assert.strictEqual(second.end.toISOString(), '2026-08-21T23:00:00.000Z');
});
