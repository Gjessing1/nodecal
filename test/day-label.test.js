// Day *labels* — the browser-local-midnight Dates the views pass around to mean
// a calendar date — and the one place that used to read one as an instant.
//
// The bug this covers: every "go to today" action was `state.selectedDate =
// new Date()`, which is an instant. The views read it back with localDateStr,
// so it named the *browser's* date while the grid marked today with
// todayStr(tz). Near midnight in a divergent zone those are different days, and
// "Today" selected the one beside today. computeDefaultStart had the mirror-
// image bug: it read the label as an instant via toDateInputValue(date, tz).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const url = (...p) => pathToFileURL(path.join(__dirname, '..', ...p)).href;
const WINDOW_URL = url('client', 'app', 'dayWindow.js');
const DEFAULT_START_URL = url('client', 'components', 'defaultStart.js');
const UTILS_URL = url('client', 'app', 'utils.js');

test('labelForDateStr round-trips through localDateStr', async () => {
  const { labelForDateStr } = await import(WINDOW_URL);
  const { localDateStr } = await import(UTILS_URL);
  for (const dateStr of ['2026-01-01', '2026-08-21', '2026-12-31', '2024-02-29']) {
    assert.equal(localDateStr(labelForDateStr(dateStr)), dateStr);
  }
});

test('labelForDateStr builds local midnight, not a UTC instant', async () => {
  const { labelForDateStr } = await import(WINDOW_URL);
  const label = labelForDateStr('2026-08-21');
  assert.equal(label.getHours(), 0);
  assert.equal(label.getMinutes(), 0);
  assert.equal(label.getDate(), 21);
});

test("todayLabel names the configured zone's date, not the browser's", async () => {
  const { todayLabel } = await import(WINDOW_URL);
  const { localDateStr, toDateInputValue } = await import(UTILS_URL);
  // Whatever host zone this runs in, the label has to read back as the date the
  // grid calls today. Auckland and Honolulu are ~22h apart, so on any given run
  // at least one of them disagrees with the host — which is the whole point.
  for (const tz of ['UTC', 'Pacific/Auckland', 'Pacific/Honolulu', 'Europe/Oslo']) {
    assert.equal(localDateStr(todayLabel(tz)), toDateInputValue(new Date(), tz));
  }
});

test('shiftLabel survives a fall-back DST day in the browser zone', async () => {
  const { shiftLabel, labelForDateStr } = await import(WINDOW_URL);
  const { localDateStr } = await import(UTILS_URL);
  // Adding 86400000ms to local midnight on the day the clocks go back lands at
  // 23:00 on the *same* date, so the next-day arrow did nothing. Asserted here
  // for whatever zone the test runs in by walking a whole year day by day.
  let label = labelForDateStr('2026-01-01');
  for (let i = 0; i < 365; i++) {
    const next = shiftLabel(label, 1);
    assert.notEqual(localDateStr(next), localDateStr(label), `stuck on ${localDateStr(label)}`);
    label = next;
  }
  assert.equal(localDateStr(label), '2027-01-01');
});

test('shiftLabel moves whole weeks and back', async () => {
  const { shiftLabel, labelForDateStr } = await import(WINDOW_URL);
  const { localDateStr } = await import(UTILS_URL);
  const wStart = labelForDateStr('2026-10-19');
  assert.equal(localDateStr(shiftLabel(wStart, 7)), '2026-10-26');
  assert.equal(localDateStr(shiftLabel(wStart, -7)), '2026-10-12');
  assert.equal(localDateStr(shiftLabel(wStart, 6)), '2026-10-25');
});

test("computeDefaultStart uses the label's own date, whatever the zone gap", async () => {
  const { computeDefaultStart } = await import(DEFAULT_START_URL);
  const { labelForDateStr } = await import(WINDOW_URL);
  // The user tapped Aug 21. It is Aug 20 20:00 UTC — already Aug 21 in Oslo,
  // still Aug 20 in New York. Neither may move the event off the tapped day.
  const now = new Date('2026-08-20T20:00:00Z');
  const label = labelForDateStr('2026-08-21');
  assert.equal(
    computeDefaultStart(label, 'Europe/Oslo', '09:00', now).toISOString(),
    '2026-08-21T07:00:00.000Z',
  );
  assert.equal(
    computeDefaultStart(label, 'America/New_York', '09:00', now).toISOString(),
    '2026-08-21T13:00:00.000Z',
  );
  // In Auckland it is already 08:00 on Aug 21, so the tapped day *is* today
  // there and the next-quarter-hour branch is the right answer — still Aug 21.
  assert.equal(
    computeDefaultStart(label, 'Pacific/Auckland', '09:00', now).toISOString(),
    '2026-08-20T20:00:00.000Z',
  );
});

test('computeDefaultStart rounds up to the next quarter hour on today', async () => {
  const { computeDefaultStart } = await import(DEFAULT_START_URL);
  const { labelForDateStr } = await import(WINDOW_URL);
  const now = new Date('2026-08-21T10:07:00Z');
  const start = computeDefaultStart(labelForDateStr('2026-08-21'), 'UTC', '09:00', now);
  assert.equal(start.toISOString(), '2026-08-21T10:15:00.000Z');
});

test('computeDefaultStart falls back to 09:00 with no configured default time', async () => {
  const { computeDefaultStart } = await import(DEFAULT_START_URL);
  const { labelForDateStr } = await import(WINDOW_URL);
  const now = new Date('2026-08-21T10:00:00Z');
  const start = computeDefaultStart(labelForDateStr('2026-09-01'), 'UTC', undefined, now);
  assert.equal(start.toISOString(), '2026-09-01T09:00:00.000Z');
});
