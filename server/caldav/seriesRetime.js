const { wallMs, fromWallMs, seriesZone, moveSeries } = require('./seriesShift');

// The editor is opened on one occurrence and sends that occurrence's times
// back, whatever the edit's scope. For a series they say how far the edit moved
// the occurrence, not where the series starts: written as DTSTART, a title
// change made from the fifth occurrence would drop the four before it. So the
// series moves by as much as the occurrence did, on its own wall clock.

/**
 * A series with the editor's times applied, read as a move of `occurrence`.
 * Its EXDATEs, RDATEs, UNTIL and overrides move along. Switching between whole
 * days and timed drops them: they name occurrences by the other value type, so
 * they would match none of the series' occurrences again.
 * @param {{ base: object, overrides: Array<object> }} series
 * @param {string} occurrence - ISO UTC start of the occurrence the editor showed
 * @param {{ start?: string, end?: string, allDay?: boolean }} edit
 * @param {string} timezone - zone the editor's times were picked in
 * @returns {{ base: object, overrides: Array<object> }}
 */
function retimeSeries(series, occurrence, edit, timezone) {
  const { base } = series;
  if (!edit.start) return series;
  let allDay = !!base.allDay;
  if (edit.allDay !== undefined) allDay = !!edit.allDay;
  const fromZone = seriesZone(base);

  if (allDay === !!base.allDay) {
    const delta = wallMs(edit.start, fromZone) - wallMs(occurrence, fromZone);
    let moved = series;
    if (delta !== 0) moved = moveSeries(base, series.overrides, delta);
    return { base: withLength(moved.base, edit), overrides: moved.overrides };
  }

  let toZone = null;
  if (!allDay) toZone = timezone;
  const delta = wallMs(edit.start, toZone) - wallMs(occurrence, fromZone);
  const start = fromWallMs(wallMs(base.start, fromZone) + delta, toZone);
  const toggled = { ...base, allDay, start, end: start, exdates: null, rdates: null };
  return { base: withLength(toggled, edit), overrides: [] };
}

/**
 * The series' master lasting as long as the edited occurrence does. Without an
 * end in the edit it keeps its own length.
 * @param {object} base - the master, already at its new start
 * @param {{ start?: string, end?: string }} edit
 */
function withLength(base, edit) {
  if (!edit.start || !edit.end) return base;
  const length = Date.parse(edit.end) - Date.parse(edit.start);
  return { ...base, end: new Date(Date.parse(base.start) + length).toISOString() };
}

module.exports = { retimeSeries };
