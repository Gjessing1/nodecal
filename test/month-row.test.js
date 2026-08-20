// How a week row of the month grid divides itself between multi-day bars and
// single-day chips. client/ is browser ES-module code, but monthRow.js is
// deliberately DOM-free so it can be imported here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'client', 'views', 'monthRow.js')).href;

function loadRow() {
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
function timed(title, y, m, d, hour) {
  const start = new Date(y, m - 1, d, hour, 0, 0, 0);
  const end = new Date(y, m - 1, d, hour + 1, 0, 0, 0);
  return {
    id: title,
    title,
    allDay: false,
    calendarId: 'c1',
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// Mon–Sun, the order the grid builds a row in.
const WEEK = [
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21',
  '2026-08-22',
  '2026-08-23',
];

/** The titles in each cell, with a null for a lane held open by a neighbour. */
function titles(layout) {
  return layout.slots.map((ev) => (ev ? ev.title : null));
}

test('a bar keeps the same chip row in every cell it crosses', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [
      allDay('Conference', '2026-08-19', '2026-08-22'), // Wed–Fri
      timed('Standup', 2026, 8, 19, 9),
      timed('Review', 2026, 8, 20, 14),
    ],
    2,
  );

  assert.deepStrictEqual(titles(layouts[2]), ['Conference', 'Standup']);
  assert.deepStrictEqual(titles(layouts[3]), ['Conference', 'Review']);
  assert.deepStrictEqual(titles(layouts[4]), ['Conference']);
});

test('a full cell drops its single-day events, never the bar crossing it', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [
      allDay('Conference', '2026-08-19', '2026-08-22'), // Wed–Fri
      timed('Standup', 2026, 8, 19, 9),
      timed('Review', 2026, 8, 19, 14),
      timed('Retro', 2026, 8, 19, 16),
    ],
    2,
  );

  assert.deepStrictEqual(titles(layouts[2]), ['Conference', 'Standup']);
  assert.strictEqual(layouts[2].hidden, 2);
});

// The bug this file exists for: a Wed–Fri bar whose Wed and Thu cells were full
// used to survive on Friday alone, which reads as a Friday event.
test('a bar past the chip cap is dropped from the whole row, not just the full cells', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [
      allDay('First', '2026-08-17', '2026-08-22'), // Mon–Fri
      allDay('Second', '2026-08-17', '2026-08-22'), // Mon–Fri
      allDay('Third', '2026-08-19', '2026-08-22'), // Wed–Fri
    ],
    2,
  );

  for (const idx of [2, 3, 4]) {
    assert.deepStrictEqual(titles(layouts[idx]), ['First', 'Second']);
    assert.strictEqual(layouts[idx].hidden, 1, `day ${WEEK[idx]} counts the dropped bar`);
  }
});

test('a lane a neighbouring bar owns is held open, not filled from below', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [
      allDay('Early', '2026-08-17', '2026-08-19'), // Mon–Tue, lane 0
      allDay('Late', '2026-08-18', '2026-08-21'), // Tue–Thu, lane 1
    ],
    2,
  );

  assert.deepStrictEqual(titles(layouts[1]), ['Early', 'Late']);
  // Wednesday has no bar in lane 0, so the lane stays empty and Late holds its row.
  assert.deepStrictEqual(titles(layouts[2]), [null, 'Late']);
  assert.deepStrictEqual(titles(layouts[3]), [null, 'Late']);
});

test('a single-day event takes a lane no bar is using in that cell', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [
      allDay('Early', '2026-08-17', '2026-08-19'), // Mon–Tue, lane 0
      allDay('Late', '2026-08-18', '2026-08-21'), // Tue–Thu, lane 1
      timed('Dentist', 2026, 8, 19, 10),
    ],
    2,
  );

  assert.deepStrictEqual(titles(layouts[2]), ['Dentist', 'Late']);
  assert.strictEqual(layouts[2].hidden, 0);
});

test('all-day events come before timed ones in the lanes left over', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [timed('Standup', 2026, 8, 17, 9), allDay('Holiday', '2026-08-17', '2026-08-18')],
    2,
  );

  assert.deepStrictEqual(titles(layouts[0]), ['Holiday', 'Standup']);
});

test('one chip row per cell while the day sheet is open', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [
      allDay('Conference', '2026-08-19', '2026-08-22'), // Wed–Fri
      timed('Standup', 2026, 8, 19, 9),
    ],
    1,
  );

  assert.deepStrictEqual(titles(layouts[2]), ['Conference']);
  assert.strictEqual(layouts[2].hidden, 1);
});

test('a bar reaching in from the previous week is laid out from the row edge', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(
    WEEK,
    [allDay('Holiday', '2026-08-10', '2026-08-19')], // ends Tue of this row
    2,
  );

  assert.deepStrictEqual(titles(layouts[0]), ['Holiday']);
  assert.deepStrictEqual(titles(layouts[1]), ['Holiday']);
  assert.deepStrictEqual(titles(layouts[2]), []);
});

test('an event outside the row is ignored entirely', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(WEEK, [timed('Next week', 2026, 8, 25, 9)], 2);

  for (const layout of layouts) {
    assert.deepStrictEqual(layout.slots, []);
    assert.strictEqual(layout.hidden, 0);
  }
});

test('an empty day reports no chip rows and nothing hidden', async () => {
  const { layoutWeekRow } = await loadRow();
  const layouts = layoutWeekRow(WEEK, [timed('Standup', 2026, 8, 17, 9)], 2);

  assert.deepStrictEqual(titles(layouts[0]), ['Standup']);
  assert.deepStrictEqual(layouts[1].slots, []);
  assert.strictEqual(layouts[1].hidden, 0);
});
